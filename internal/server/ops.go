package server

import (
	"crypto/subtle"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
)

// ServeHTTP keeps production management routes behind the authenticated ops
// gateway. Forwarded client headers never establish trust.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ServerMode {
		p := r.URL.Path
		if p == "/admin" || strings.HasPrefix(p, "/admin/") || p == "/setup" || strings.HasPrefix(p, "/setup/") {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(p, s.cfg.AdminBase) || strings.HasPrefix(p, "/internal/ops/") {
			host, _, _ := net.SplitHostPort(r.RemoteAddr)
			ip := net.ParseIP(host)
			if s.cfg.OpsToken == "" || ip == nil || !ip.IsLoopback() || subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+s.cfg.OpsToken)) != 1 {
				http.NotFound(w, r)
				return
			}
			if !cleanManagementPath(r) || (p != s.cfg.AdminBase && !strings.HasPrefix(p, s.cfg.AdminBase+"/") && p != "/internal/ops/status") || p == s.cfg.AdminBase+"/publish" {
				http.NotFound(w, r)
				return
			}
			if _, err := strconv.ParseInt(r.Header.Get("X-Ops-Account"), 10, 64); err != nil {
				http.NotFound(w, r)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
			w.Header().Set("Cache-Control", "no-store")
			if p == "/internal/ops/status" {
				if r.Method != "GET" {
					w.WriteHeader(405)
					return
				}
				posts, err := s.store.AllPosts()
				if err != nil {
					http.Error(w, "status unavailable", 503)
					return
				}
				published := 0
				for _, p := range posts {
					if p.Published {
						published++
					}
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"posts": len(posts), "published": published, "drafts": len(posts) - published})
				return
			}
		}
	}
	s.mux.ServeHTTP(w, r)
}
func cleanManagementPath(r *http.Request) bool {
	if r.URL.RawPath != "" || strings.ContainsAny(r.URL.EscapedPath(), "%\\") || strings.Contains(r.URL.Path, "//") {
		return false
	}
	for _, p := range strings.Split(r.URL.Path, "/") {
		if p == "." || p == ".." {
			return false
		}
	}
	return true
}
func (s *Server) adminBase() string {
	if s.cfg.AdminBase != "" {
		return s.cfg.AdminBase
	}
	return "/admin"
}
func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(s.render.Markdown(r.PostForm.Get("body_md"))))
}
