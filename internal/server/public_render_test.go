package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dev-home-blog/internal/render"
	"dev-home-blog/internal/store"
)

// newPublicTestServer builds a real Server for page-level tests: a fresh SQLite
// store under t.TempDir(), templates parsed from the repo's web/ tree (so tests
// always see the current templates, not the embedded copy) and web/static as
// the static FS. The returned store lets callers seed data before requesting.
// Shared fixture for the redesign WPs — append assertions, don't fork it.
func newPublicTestServer(t *testing.T) (*Server, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "blog.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	static := os.DirFS("../../web/static")
	rnd, err := render.New(os.DirFS("../../web"), static)
	if err != nil {
		t.Fatalf("render.New: %v", err)
	}
	srv, err := New(Config{RepoDir: t.TempDir()}, st, rnd, static)
	if err != nil {
		t.Fatalf("server.New: %v", err)
	}
	return srv, st
}

// doRequest sends one request through the server's router and returns the
// recorded response.
func doRequest(t *testing.T, srv *Server, method, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	srv.mux.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

// The admin theme picker is retired: the route must not exist at all.
func TestAdminThemeRouteRemoved(t *testing.T) {
	srv, _ := newPublicTestServer(t)
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		rec := doRequest(t, srv, method, "/admin/theme")
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s /admin/theme status = %d, want %d", method, rec.Code, http.StatusNotFound)
		}
	}
}

// Self-hosted fonts (web/static/fonts, added by WP0) must be served with the
// one-year immutable cache. Skips until fonts.css exists in the repo tree; the
// router-level policy is covered unconditionally in static_cache_test.go.
func TestFontsCSSIsImmutable(t *testing.T) {
	if _, err := os.Stat("../../web/static/fonts/fonts.css"); err != nil {
		t.Skip("web/static/fonts/fonts.css not present yet (WP0)")
	}
	srv, _ := newPublicTestServer(t)
	rec := doRequest(t, srv, http.MethodGet, "/static/fonts/fonts.css")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /static/fonts/fonts.css status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Cache-Control"); !strings.Contains(got, "immutable") || !strings.Contains(got, "max-age=31536000") {
		t.Fatalf("Cache-Control = %q, want one-year immutable", got)
	}
}

// The admin sidebar must no longer link to the retired theme page.
func TestAdminNavHasNoThemeLink(t *testing.T) {
	srv, _ := newPublicTestServer(t)
	rec := doRequest(t, srv, http.MethodGet, "/admin")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /admin status = %d, want %d", rec.Code, http.StatusOK)
	}
	body := rec.Body.String()
	for _, bad := range []string{`href="/admin/theme"`, `<span class="nav-zh">主题</span>`} {
		if strings.Contains(body, bad) {
			t.Errorf("admin page still contains %q", bad)
		}
	}
	if !strings.Contains(body, `data-theme="F"`) {
		t.Error(`admin page lost <html data-theme="F"> (crt.css scanlines depend on it)`)
	}
}
