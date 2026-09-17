// Package server wires HTTP routing, middleware, and handlers together.
package server

import (
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"dev-home-blog/internal/render"
	"dev-home-blog/internal/setup"
	"dev-home-blog/internal/store"
)

// Config holds runtime configuration for the server.
type Config struct {
	AdminBase string
	OpsToken  string
	Addr      string
	DBPath    string
	Secure    bool   // set Secure flag on cookies (HTTPS deployments)
	RepoDir   string // working dir for git/gh commands in the setup wizard
	// ServerMode keeps the process running as a long-lived daemon (e.g. behind
	// systemd + Nginx). It disables the idle watchdog that otherwise exits the
	// process once every browser tab closes — that auto-exit suits the local
	// double-click launcher but would take a hosted blog offline whenever no one
	// is viewing it.
	ServerMode bool
}

// Server holds shared dependencies for all handlers.
type Server struct {
	cfg      Config
	store    *store.Store
	render   *render.Renderer
	mux      *http.ServeMux
	static   fs.FS
	detector *setup.Detector
	actor    *setup.Actor
	goos     string
	// lastBeat is the Unix-nanosecond timestamp of the most recent browser
	// heartbeat (GET /internal/alive). The watchdog in lifecycle.go shuts the
	// server down once no page has pinged for idleTimeout, so closing every
	// blog tab makes the background process exit on its own.
	lastBeat atomic.Int64
}

// New constructs the server and registers routes.
func New(cfg Config, st *store.Store, rnd *render.Renderer, static fs.FS) (*Server, error) {
	if cfg.AdminBase != "" && (cfg.AdminBase != "/ojbk/opq_aaa/blog/admin" || len(cfg.OpsToken) < 32) {
		return nil, errors.New("invalid ops gateway configuration")
	}
	if cfg.ServerMode && cfg.AdminBase == "" {
		cfg.AdminBase = "/ojbk/opq_aaa/blog/admin"
	}
	if strings.ContainsAny(cfg.OpsToken, "\r\n") {
		return nil, errors.New("invalid ops credential")
	}
	repo := cfg.RepoDir
	if repo == "" {
		repo = "."
	}
	// binDir is where the wizard drops tools it downloads itself (the GitHub
	// CLI), so a beginner never needs Homebrew or any package manager. The
	// runner searches it before the system PATH.
	binDir := managedBinDir()
	runner := setup.ExecRunner{BinDir: binDir}
	s := &Server{
		cfg: cfg, store: st, render: rnd, static: static, mux: http.NewServeMux(),
		detector: &setup.Detector{Run: runner, Repo: repo},
		actor:    &setup.Actor{Run: runner, Repo: repo, BinDir: binDir},
		goos:     runtime.GOOS,
	}

	// Treat startup as a fresh heartbeat so the idle watchdog gives the browser
	// time to load the first page and start pinging before it can shut down.
	s.lastBeat.Store(time.Now().UnixNano())
	s.routes()
	return s, nil
}

// managedBinDir returns the app-private directory for self-downloaded tools,
// e.g. ~/.dev-home-blog/bin. It falls back to a local ".dev-home-blog/bin" if
// the user home cannot be resolved, so the wizard still works.
func managedBinDir() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return filepath.Join(".dev-home-blog", "bin")
	}
	return filepath.Join(home, ".dev-home-blog", "bin")
}
