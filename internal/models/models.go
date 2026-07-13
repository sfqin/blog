// Package models defines the content types rendered on the site and edited via /admin.
package models

// Profile is the single-row whoami / hero content.
type Profile struct {
	Name      string
	Title     string
	Tagline   string
	AboutMD   string
	Stack     string // comma-separated tech tags
	GitHubURL string
	Email     string
	Location  string
	UpdatedAt string
}

// StackTags splits the comma-separated stack into trimmed tags.
func (p Profile) StackTags() []string { return splitTags(p.Stack) }

// Experience is one entry in the career timeline.
type Experience struct {
	ID          int64
	Period      string
	Company     string
	Role        string
	Description string
	SortOrder   int
}

// Thought is a short opinion / note card.
type Thought struct {
	ID    int64
	Body  string
	Topic string
	Date  string
}

// Project is a card in the projects grid.
type Project struct {
	ID          int64
	Name        string
	Description string
	Language    string
	Stars       int
	License     string
	URL         string
	SortOrder   int
}

// Post is a blog post / note.
type Post struct {
	ID        int64
	Slug      string
	Title     string
	Date      string
	Tags      string // comma-separated
	BodyMD    string
	Published bool
	CreatedAt string
	UpdatedAt string
}

// TagList splits the comma-separated tags into trimmed values.
func (p Post) TagList() []string { return splitTags(p.Tags) }

// Footprint is one visited city (country -> province -> city).
type Footprint struct {
	ID          int64
	CountryCode string
	CountryName string
	Province    string
	City        string
	Note        string
	SortOrder   int
}
