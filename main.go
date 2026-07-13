package main

import (
	"embed"
	"io/fs"
	"log"
	"os"

	"dev-home-blog/internal/render"
	"dev-home-blog/internal/server"
	"dev-home-blog/internal/store"
)

//go:embed all:web
var webFS embed.FS

func main() {
	cfg := server.Config{
		Addr:          envOr("ADDR", ":8080"),
		DBPath:        envOr("DB_PATH", "blog.db"),
		AdminUsername: envOr("ADMIN_USERNAME", "admin"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"), // sets/updates initial password when non-empty
		Secure:        os.Getenv("SECURE_COOKIES") == "1",
	}

	st, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	tmplFS, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatalf("template fs: %v", err)
	}
	rnd, err := render.New(tmplFS)
	if err != nil {
		log.Fatalf("render: %v", err)
	}

	staticFS, err := fs.Sub(webFS, "web/static")
	if err != nil {
		log.Fatalf("static fs: %v", err)
	}

	srv, err := server.New(cfg, st, rnd, staticFS)
	if err != nil {
		log.Fatalf("server: %v", err)
	}

	log.Printf("dev@home blog listening on %s (db=%s)", cfg.Addr, cfg.DBPath)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("serve: %v", err)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
