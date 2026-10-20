import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import numpy as np

from flood_risk.service import WeatherUnavailableError, assess
from flood_risk.weather import fetch_rain


class FloodRiskWeatherTests(unittest.TestCase):
    def setUp(self):
        self.grid = np.zeros((1, 1))
        self.card = {
            "trained_on": "test",
            "kind": "test",
            "mode": "tier4",
            "version": "test",
            "created_at": "test",
        }

    def terrain_patches(self):
        return (
            patch("flood_risk.service.build_grid", return_value=(self.grid, self.grid, 0.1, 0.1, 100)),
            patch("flood_risk.service.get_elevation", return_value=(self.grid, "test elevation")),
            patch("flood_risk.service.derive", return_value=(self.grid, self.grid, self.grid)),
        )

    def test_weather_failure_stops_assessment_instead_of_predicting_with_zero_rain(self):
        build_grid, get_elevation, derive = self.terrain_patches()
        with build_grid, get_elevation, derive, patch(
            "flood_risk.service.fetch_rain", side_effect=TimeoutError("provider timeout")
        ), patch("flood_risk.service.predict") as predict:
            with self.assertRaises(WeatherUnavailableError):
                assess(12.9, 77.5, 1000, 1, None, None, 0.5)
        predict.assert_not_called()

    def test_explicit_rain_scenario_does_not_require_live_weather(self):
        build_grid, get_elevation, derive = self.terrain_patches()
        with build_grid, get_elevation, derive, patch("flood_risk.service.fetch_rain") as fetch_rain, patch(
            "flood_risk.service.predict",
            return_value=(np.array([0]), np.array([0.1]), np.array([[1.0, 0.0, 0.0, 0.0]])),
        ), patch("flood_risk.service.get_model", return_value=({}, self.card)):
            result = assess(12.9, 77.5, 1000, 1, 20, 5, 0.5)

        fetch_rain.assert_not_called()
        self.assertEqual(result["inputs"]["rain_24h_mm"], 20.0)
        self.assertEqual(result["sources"]["rain"], "manual scenario")

    def test_weather_rejects_missing_values_instead_of_counting_them_as_zero(self):
        start = datetime(2026, 10, 17, tzinfo=timezone.utc)
        times = [(start + timedelta(hours=index)).strftime("%Y-%m-%dT%H:00") for index in range(49)]
        values = [0.0] * len(times)
        values[24] = None
        response = unittest.mock.Mock()
        response.json.return_value = {"hourly": {"time": times, "precipitation": values}}
        response.raise_for_status.return_value = None

        with patch("flood_risk.weather.datetime") as mocked_datetime, patch(
            "flood_risk.weather.httpx.get", return_value=response
        ):
            mocked_datetime.now.return_value = datetime(2026, 10, 18, tzinfo=timezone.utc)
            with self.assertRaisesRegex(ValueError, "missing hourly precipitation"):
                fetch_rain(12.9, 77.5)


if __name__ == "__main__":
    unittest.main()
