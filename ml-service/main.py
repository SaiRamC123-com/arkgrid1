import hmac
import os
from contextlib import asynccontextmanager
from typing import List, Literal, Optional
from search_zone.drift_model import estimate  # noqa: E402
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

load_dotenv()

from clustering.dbscan_model import HDBSCAN, cluster_events  # noqa: E402
from flood_risk.model import get_model  # noqa: E402
from flood_risk.service import WeatherUnavailableError, assess  # noqa: E402
from simulator.flood_sim import simulate_rain, simulate_surge  # noqa: E402
API_KEY = os.getenv("ML_API_KEY", "")
if not API_KEY:
    print("WARNING: ML_API_KEY is not set. The service accepts unauthenticated requests.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_model()  # loads, or trains the synthetic demo model on first run
    yield


app = FastAPI(title="ArkGrid ML Service", version="0.3.0", lifespan=lifespan)


def require_key(x_internal_key: str = Header(default="")):
    if API_KEY and not hmac.compare_digest(x_internal_key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


class Event(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    kind: Literal["sos", "report"]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    t: float
    weight: float = Field(default=1.0, gt=0, le=10)


class ClusterParams(BaseModel):
    algorithm: Literal["dbscan", "hdbscan"] = "dbscan"
    eps_m: float = Field(default=150, ge=20, le=5000)
    time_window_min: float = Field(default=60, ge=5, le=1440)
    min_samples: int = Field(default=2, ge=1, le=10)


class ClusterRequest(BaseModel):
    events: List[Event] = Field(max_length=2000)
    params: ClusterParams = Field(default_factory=ClusterParams)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [e.id for e in self.events]
        if len(ids) != len(set(ids)):
            raise ValueError("event ids must be unique")
        return self


class RiskRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: float = Field(default=3000, ge=500, le=10000)
    grid: int = Field(default=14, ge=6, le=20)
    rain_24h_mm: Optional[float] = Field(default=None, ge=0, le=1000)
    rain_1h_mm: Optional[float] = Field(default=None, ge=0, le=200)
    soil_perm: float = Field(default=0.5, ge=0, le=1)

    @model_validator(mode="after")
    def cell_size(self):
        if 2 * self.radius_m / self.grid < 90:
            raise ValueError("cells smaller than 90 m exceed the terrain data resolution")
        return self

class ZoneRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    elapsed_min: float = Field(ge=1, le=20160)
    situation: Literal["water_borne", "on_foot", "stranded"]
    bearing_deg: Optional[float] = Field(default=None, ge=0, lt=360)
    speed_ms: Optional[float] = Field(default=None, ge=0, le=4)
    accuracy_m: float = Field(default=50, ge=0, le=2000)
    seed: int = Field(default=7, ge=0, le=2**31 - 1)


@app.post("/search-zone", dependencies=[Depends(require_key)])
def search_zone(req: ZoneRequest):
    return estimate(req.lat, req.lng, req.elapsed_min, req.situation, req.bearing_deg, req.speed_ms, req.accuracy_m, req.seed)
@app.get("/health")
def health():
    card = get_model()[1]
    return {
        "status": "ok",
        "service": "arkgrid-ml",
        "clustering": ["dbscan"] + (["hdbscan"] if HDBSCAN is not None else []),
        "flood_model": {"trained_on": card["trained_on"], "mode": card["mode"], "kind": card["kind"]},
    }


@app.post("/cluster", dependencies=[Depends(require_key)])
def cluster(req: ClusterRequest):
    p = req.params
    return cluster_events([e.model_dump() for e in req.events], p.algorithm, p.eps_m, p.time_window_min, p.min_samples)


@app.post("/flood-risk", dependencies=[Depends(require_key)])
def flood_risk(req: RiskRequest):
    try:
        return assess(req.lat, req.lng, req.radius_m, req.grid, req.rain_24h_mm, req.rain_1h_mm, req.soil_perm)
    except WeatherUnavailableError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err


@app.get("/flood-risk/model", dependencies=[Depends(require_key)])
def flood_model():
    return get_model()[1]
class RainScenario(BaseModel):
    intensity_mm_h: float = Field(ge=1, le=150)
    hours: int = Field(default=6, ge=1, le=12)
    antecedent_mm: float = Field(default=0, ge=0, le=300)


class SurgeScenario(BaseModel):
    height_m: float = Field(ge=0.1, le=5)
    rise_m_per_h: float = Field(default=0.5, ge=0.05, le=3)
    source_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    source_lng: Optional[float] = Field(default=None, ge=-180, le=180)
    walk_ms: float = Field(default=0.8, ge=0.2, le=2)


class SimRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: float = Field(default=3000, ge=500, le=10000)
    grid: int = Field(default=14, ge=6, le=20)
    soil_perm: float = Field(default=0.5, ge=0, le=1)
    mode: Literal["rain", "surge"]
    rain: Optional[RainScenario] = None
    surge: Optional[SurgeScenario] = None

    @model_validator(mode="after")
    def check(self):
        if 2 * self.radius_m / self.grid < 90:
            raise ValueError("cells smaller than 90 m exceed the terrain data resolution")
        if (self.mode == "rain" and self.rain is None) or (self.mode == "surge" and self.surge is None):
            raise ValueError("scenario parameters are missing")
        return self


@app.post("/simulate", dependencies=[Depends(require_key)])
def simulate(req: SimRequest):
    if req.mode == "rain":
        r = req.rain
        return simulate_rain(req.lat, req.lng, req.radius_m, req.grid, req.soil_perm, r.intensity_mm_h, r.hours, r.antecedent_mm)
    s = req.surge
    return simulate_surge(req.lat, req.lng, req.radius_m, req.grid, s.height_m, s.rise_m_per_h, s.source_lat, s.source_lng, s.walk_ms)