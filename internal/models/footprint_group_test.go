package models

import (
	"encoding/json"
	"testing"
)

func TestGroupFootprints(t *testing.T) {
	fps := []Footprint{
		{CountryCode: "CN", CountryName: "中国", Province: "湖南省", City: "长沙市"},
		{CountryCode: "CN", CountryName: "中国", Province: "北京市", City: "东城区"},
		{CountryCode: "CN", CountryName: "中国", Province: "湖南省", City: "株洲市"},
		{CountryCode: "JP", CountryName: "日本", Province: "东京都", City: "新宿区"},
		{CountryCode: "SG", CountryName: "新加坡"}, // country-only, no province
		{CountryCode: "", CountryName: "skip me"}, // dropped: empty code
	}

	got := GroupFootprints(fps)

	if len(got) != 3 {
		t.Fatalf("want 3 countries, got %d: %+v", len(got), got)
	}
	// Country order preserved by first appearance.
	if got[0].Code != "CN" || got[1].Code != "JP" || got[2].Code != "SG" {
		t.Fatalf("country order wrong: %s,%s,%s", got[0].Code, got[1].Code, got[2].Code)
	}
	// CN: two provinces in first-seen order, 湖南省 has two cities.
	cn := got[0]
	if len(cn.Provinces) != 2 {
		t.Fatalf("CN want 2 provinces, got %d", len(cn.Provinces))
	}
	if cn.Provinces[0].Name != "湖南省" || len(cn.Provinces[0].Cities) != 2 {
		t.Fatalf("CN province[0] wrong: %+v", cn.Provinces[0])
	}
	if cn.Provinces[0].Cities[0] != "长沙市" || cn.Provinces[0].Cities[1] != "株洲市" {
		t.Fatalf("CN 湖南省 cities wrong: %v", cn.Provinces[0].Cities)
	}
	// SG: country-only, no provinces.
	if len(got[2].Provinces) != 0 {
		t.Fatalf("SG should have no provinces, got %+v", got[2].Provinces)
	}
}

// The globe consumes this via fetch().json(); guard the JSON field names.
func TestGroupFootprintsJSONShape(t *testing.T) {
	out := GroupFootprints([]Footprint{
		{CountryCode: "CN", CountryName: "中国", Province: "北京市", City: "东城区"},
	})
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"code":"CN","name":"中国","provinces":[{"name":"北京市","cities":["东城区"]}]}]`
	if string(b) != want {
		t.Fatalf("json shape drift:\n got: %s\nwant: %s", b, want)
	}
}
