package models

// FootprintCountry is the grouped structure the globe JS consumes:
// country -> provinces -> cities. It is produced by GroupFootprints and
// serialized identically by both the live API and the static exporter.
type FootprintCountry struct {
	Code      string              `json:"code"`
	Name      string              `json:"name"`
	Provinces []FootprintProvince `json:"provinces"`
}

// FootprintProvince is a province/state with its visited cities.
type FootprintProvince struct {
	Name   string   `json:"name"`
	Cities []string `json:"cities"`
}

// GroupFootprints collapses flat footprint rows into the nested
// country/province/city shape the globe expects, preserving input order.
func GroupFootprints(fps []Footprint) []FootprintCountry {
	type provKey struct{ code, prov string }
	countryOrder := []string{}
	countryIdx := map[string]int{}
	provOrder := map[string][]string{}   // code -> province order
	provCities := map[provKey][]string{} // (code,prov) -> cities
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

	out := make([]FootprintCountry, 0, len(countryOrder))
	for _, code := range countryOrder {
		c := FootprintCountry{Code: code, Name: countryName[code]}
		for _, prov := range provOrder[code] {
			c.Provinces = append(c.Provinces, FootprintProvince{
				Name:   prov,
				Cities: provCities[provKey{code, prov}],
			})
		}
		out = append(out, c)
	}
	return out
}
