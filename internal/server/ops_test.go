package server

import (
	"dev-home-blog/internal/render"
	"dev-home-blog/internal/store"
	"io/fs"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testAdminBase = "/ojbk/opq_aaa/blog/admin"

func opsFixture(t *testing.T) *Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "blog.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	web := os.DirFS("../../web")
	static, _ := fs.Sub(web, "static")
	rnd, err := render.New(web, static)
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{ServerMode: true, AdminBase: testAdminBase, OpsToken: strings.Repeat("x", 64)}, st, rnd, static)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func blogRequest(s *Server, method, path, body string, trusted bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "127.0.0.1:3456"
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if trusted {
		r.Header.Set("Authorization", "Bearer "+strings.Repeat("x", 64))
		r.Header.Set("X-Ops-CSRF", "test-csrf")
		r.Header.Set("X-Ops-Account", "42")
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func TestOpsGatewayBoundaryAndPaths(t *testing.T) {
	s := opsFixture(t)
	for _, p := range []string{"/admin", "/admin/posts", "/setup", "/setup/status", "/setup/install", testAdminBase, testAdminBase + "/posts/new", "/internal/ops/status"} {
		if w := blogRequest(s, "GET", p, "", false); w.Code != 404 {
			t.Errorf("untrusted %s: %d", p, w.Code)
		}
	}
	for _, p := range []string{testAdminBase + "/publish", testAdminBase + "/../setup", testAdminBase + "//posts", testAdminBase + "/%70osts"} {
		if w := blogRequest(s, "GET", p, "", true); w.Code != 404 {
			t.Errorf("escape %s: %d", p, w.Code)
		}
	}
	w := blogRequest(s, "GET", testAdminBase+"/posts/new", "", true)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "action=\""+testAdminBase+"/posts\"") || strings.Contains(body, "href=\"/admin") || strings.Contains(body, "/admin/publish") || !strings.Contains(body, "value=\"test-csrf\"") {
		t.Fatal("paths or csrf not adapted")
	}
	if len(w.Result().Cookies()) != 0 {
		t.Fatal("gateway must not issue a second session/csrf cookie")
	}
}

func TestOpsDashboardHidesPublishingSetup(t *testing.T) {
	s := opsFixture(t)
	w := blogRequest(s, "GET", testAdminBase, "", true)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	body := w.Body.String()
	if strings.Contains(body, "/publish") || strings.Contains(body, "发布上线") {
		t.Fatal("privileged publishing entry leaked into ops mode")
	}
}
func TestOpsWritesAndPreview(t *testing.T) {
	s := opsFixture(t)
	form := url.Values{"title": {"ops draft"}, "slug": {"ops-draft"}, "body_md": {"# text"}}
	if w := blogRequest(s, "POST", testAdminBase+"/posts", form.Encode(), true); w.Code != 403 {
		t.Fatal("missing csrf accepted", w.Code)
	}
	form.Set("csrf_token", "test-csrf")
	w := blogRequest(s, "POST", testAdminBase+"/posts", form.Encode(), true)
	if w.Code != 303 || w.Header().Get("Location") != testAdminBase+"/posts?flash=created" {
		t.Fatal(w.Code, w.Header())
	}
	posts, err := s.store.AllPosts()
	if err != nil || len(posts) != 1 || posts[0].Published {
		t.Fatal("draft write failed", err, posts)
	}
	form.Set("body_md", "[x](javascript:alert(1)) <script>alert(1)</script>")
	w = blogRequest(s, "POST", testAdminBase+"/preview", form.Encode(), true)
	if w.Code != 200 || strings.Contains(w.Body.String(), "href=\"javascript:") || strings.Contains(w.Body.String(), "<script>") {
		t.Fatal("unsafe preview", w.Code, w.Body.String())
	}
	if w := blogRequest(s, "GET", "/", "", false); w.Code != 200 {
		t.Fatal("public site broken", w.Code)
	}
}
