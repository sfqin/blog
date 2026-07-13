package server

import (
	"encoding/json"
	"net/http"

	"dev-home-blog/internal/models"
)

// handleFootprintsAPI returns visited places grouped country -> province -> cities.
func (s *Server) handleFootprintsAPI(w http.ResponseWriter, r *http.Request) {
	fps, err := s.store.Footprints()
	if err != nil {
		s.serverError(w, "footprints", err)
		return
	}
	out := models.GroupFootprints(fps)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(out)
}
