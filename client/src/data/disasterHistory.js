export const HISTORICAL_INCIDENTS = [
  {
    id: "us7000pn9s",
    hazardType: "earthquake",
    title: "M 7.7 Mandalay, Myanmar earthquake",
    eventAt: "2025-03-28T06:20:52.715Z",
    latitude: 22.011,
    longitude: 95.9363,
    location: "Near Mandalay, Myanmar",
    precision: "USGS-reviewed epicentre",
    region: "Myanmar",
    magnitude: 7.7,
    depthKm: 10,
    description: "A major earthquake near Mandalay. The marker is the seismic epicentre, not the location of impacts reported elsewhere.",
    affectedRegions: ["Mandalay, Myanmar"],
    sourceName: "USGS FDSN Event Web Service",
    sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000pn9s",
    relatedSources: [
      {
        name: "USGS event details",
        url: "https://www.usgs.gov/news/featured-story/m77-mandalay-burma-myanmar-earthquake",
      },
    ],
    sourceUpdatedAt: "2026-07-18T00:53:31.066Z",
    status: "HISTORICAL",
    confidence: "USGS event reviewed",
    lastUpdatedAt: "2026-07-18T00:53:31.066Z",
    demo: false,
  },
  {
    id: "us7000pn9s-impact-bangkok",
    relatedIncidentId: "us7000pn9s",
    hazardType: "earthquake",
    title: "Bangkok earthquake impact",
    eventAt: "2025-03-28T06:20:52.715Z",
    latitude: 13.7563,
    longitude: 100.5018,
    location: "Bangkok, Thailand",
    precision: "Approximate city marker; not a damage-site coordinate",
    region: "Thailand",
    magnitude: null,
    depthKm: null,
    description: "Reported impacts include the collapse of a building under construction. This city marker is separate from the Myanmar epicentre; the reference sources do not supply a verified building coordinate, so no damage-site location is represented.",
    affectedRegions: ["Bangkok, Thailand"],
    sourceName: "USGS PAGER / USGS event information",
    sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000pn9s/pager/",
    relatedSources: [
      {
        name: "USGS event details",
        url: "https://www.usgs.gov/news/featured-story/m77-mandalay-burma-myanmar-earthquake",
      },
    ],
    sourceUpdatedAt: null,
    status: "HISTORICAL",
    confidence: "Reported impact; reference supplied; city marker approximate, building location unverified",
    lastUpdatedAt: null,
    demo: false,
  },
  {
    id: "nepal-bhote-koshi-trishuli-2026-08-26",
    hazardType: "flood",
    title: "Bhote Koshi–Trishuli floods",
    eventAt: "2026-08-26",
    latitude: 28.16,
    longitude: 85.34,
    location: "Rasuwa District, Nepal",
    precision: "Approximate district marker; not a flood epicentre",
    region: "Nepal · Rasuwa, Nuwakot, Dhading and Chitwan",
    magnitude: null,
    depthKm: null,
    description: "WHO reports flood damage to homes, markets, roads, bridges, customs facilities and hydropower infrastructure. The source reports around 10,000 households needing immediate relief. The source page does not define an inundation boundary or an exact event coordinate.",
    affectedRegions: ["Rasuwa", "Nuwakot", "Dhading", "Chitwan"],
    sourceName: "World Health Organization",
    sourceUrl: "https://www.who.int/nepal/emergencies/2026-rasuwa-flash-floods",
    relatedSources: [],
    sourceUpdatedAt: null,
    status: "HISTORICAL",
    confidence: "Official situation report; district-level location",
    lastUpdatedAt: null,
    demo: false,
  },
  {
    id: "nepal-budhi-gandaki-flood-2026-10-11",
    hazardType: "flood",
    secondaryHazards: ["landslide"],
    title: "Budhi Gandaki River flooding",
    eventAt: "2026-10-11",
    latitude: 28.12,
    longitude: 84.63,
    location: "Gorkha District, Nepal",
    precision: "Approximate district marker; not a slide or flood coordinate",
    region: "Nepal · Gorkha District · Budhi Gandaki corridor",
    magnitude: null,
    depthKm: null,
    description: "The cited report describes flooding after a landslide blocked the Budhi Gandaki River and evacuation advice to villagers. The cited article could not be independently retrieved during this implementation; downstream locations and flood boundaries are not inferred.",
    affectedRegions: ["Gorkha District", "Budhi Gandaki River corridor"],
    sourceName: "Reuters (source link supplied with request)",
    sourceUrl: "https://www.reuters.com/business/environment/nepal-urges-villagers-to-evacuate-after-flood-triggered-by-landslide-2026-10-11/",
    relatedSources: [],
    sourceUpdatedAt: null,
    status: "RECENT REPORT",
    confidence: "Preliminary report; source retrieval unavailable",
    lastUpdatedAt: null,
    demo: false,
  },
];

export const DEMO_INCIDENTS = [
  {
    id: "demo-flood-scenario",
    hazardType: "flood",
    title: "DEMO DATA — simulated flood scenario",
    eventAt: null,
    latitude: 12.9716,
    longitude: 77.5946,
    location: "Demonstration marker · Bengaluru",
    precision: "Synthetic demo coordinate",
    region: "DEMO ONLY",
    magnitude: null,
    depthKm: null,
    description: "Synthetic demonstration marker only. It is not a real incident, official alert, evacuation area, flood boundary, or road closure.",
    affectedRegions: [],
    sourceName: "ArkGrid demonstration fixture",
    sourceUrl: null,
    relatedSources: [],
    sourceUpdatedAt: null,
    status: "DEMO DATA",
    confidence: "Synthetic; not verified",
    lastUpdatedAt: null,
    demo: true,
  },
];

export const HAZARD_COLORS = {
  earthquake: "#dc2626",
  flood: "#2563eb",
  landslide: "#a16207",
  demo: "#7c3aed",
};

export function visualClusters(records, project, radius = 44) {
  const projected = records.map((record) => ({
    record,
    point: project(record.latitude, record.longitude),
  }));
  const used = new Set();
  const groups = [];

  projected.forEach((entry, index) => {
    if (used.has(index)) return;
    const group = [entry];
    used.add(index);
    for (let cursor = 0; cursor < group.length; cursor += 1) {
      const point = group[cursor].point;
      projected.forEach((candidate, candidateIndex) => {
        if (used.has(candidateIndex)) return;
        if (Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) <= radius) {
          used.add(candidateIndex);
          group.push(candidate);
        }
      });
    }
    groups.push(group.map(({ record }) => record));
  });

  return groups;
}

export function filterIncidents(records, filters) {
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00Z`).getTime() : -Infinity;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999Z`).getTime() : Infinity;
  const regionQuery = filters.region.trim().toLowerCase();

  return records.filter((record) => {
    if (filters.hazard !== "all" && record.hazardType !== filters.hazard && !record.secondaryHazards?.includes(filters.hazard)) return false;
    if (record.demo && !filters.includeDemo) return false;
    const date = record.eventAt ? new Date(record.eventAt).getTime() : NaN;
    if (Number.isFinite(date) && (date < start || date > end)) return false;
    if (!Number.isFinite(date) && (filters.startDate || filters.endDate)) return false;
    if (regionQuery && !`${record.region} ${record.location} ${record.affectedRegions.join(" ")}`.toLowerCase().includes(regionQuery)) return false;
    if (filters.severity === "rated" && record.magnitude == null) return false;
    if (filters.severity === "unrated" && record.magnitude != null) return false;
    return true;
  });
}
