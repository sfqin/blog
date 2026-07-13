package server

import (
	"encoding/json"
	"net/http"

	"dev-home-blog/internal/models"
)

// footprintCountry is the grouped structure the globe JS consumes.
type footprintCountry struct {
	Code      string              `json:"code"`
	Name      string              `json:"name"`
	Provinces []footprintProvince `json:"provinces"`
}

type footprintProvince struct {
	Name   string   `json:"name"`
	Cities []string `json:"cities"`
}

// handleFootprintsAPI returns visited places grouped country -> province -> cities.
func (s *Server) handleFootprintsAPI(w http.ResponseWriter, r *http.Request) {
	fps, err := s.store.Footprints()
	if err != nil {
		s.serverError(w, "footprints", err)
		return
	}
	out := groupFootprints(fps)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(out)
}

// groupFootprints collapses flat rows into the nested country/province/city shape.
func groupFootprints(fps []models.Footprint) []footprintCountry {
	type provKey struct{ code, prov string }
	countryOrder := []string{}
	countryIdx := map[string]int{}
	provOrder := map[string][]string{}      // code -> province order
	provCities := map[provKey][]string{}    // (code,prov) -> cities
	countryName := map[string]string{}

	for _, f := range fps {
		if f.CountryCode == "" {
			continue
		}
		if _, ok := countryIdx[f.CountryCode]; !ok {
			countryIdx[f.CountryCode] = len(countryOrder)
			countryOrder = append(countryOrder, f.CountryCode)
		}
		if f.CountryName != "" {
			countryName[f.CountryCode] = f.CountryName
		}
		if f.Province != "" {
			key := provKey{f.CountryCode, f.Province}
			if _, seen := provCities[key]; !seen {
				provOrder[f.CountryCode] = append(provOrder[f.CountryCode], f.Province)
			}
			if f.City != "" {
				provCities[key] = append(provCities[key], f.City)
			} else if _, ok := provCities[key]; !ok {
				provCities[key] = []string{}
			}
		}
	}

	out := make([]footprintCountry, 0, len(countryOrder))
	for _, code := range countryOrder {
		c := footprintCountry{Code: code, Name: countryName[code]}
		for _, prov := range provOrder[code] {
			c.Provinces = append(c.Provinces, footprintProvince{
				Name:   prov,
				Cities: provCities[provKey{code, prov}],
			})
		}
		out = append(out, c)
	}
	return out
}
