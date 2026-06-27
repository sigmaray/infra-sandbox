package main

import (
	"database/sql"
	"embed"
	"html/template"
	"log"
	"os"

	"go-blog/handlers"
	"go-blog/middleware"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/pressly/goose/v3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

func main() {
	// Ensure data directory exists
	if err := os.MkdirAll("data", 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	// Connect to SQLite using standard database/sql for Goose
	db, err := sql.Open("sqlite3", "data/blog.db")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Run Goose migrations
	goose.SetBaseFS(embedMigrations)
	if err := goose.SetDialect("sqlite3"); err != nil {
		log.Fatalf("Failed to set goose dialect: %v", err)
	}
	if err := goose.Up(db, "migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Connect to SQLite using Gorm
	gormDB, err := gorm.Open(sqlite.Dialector{Conn: db}, &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to gorm: %v", err)
	}

	r := gin.Default()

	// Setup sessions
	store := cookie.NewStore([]byte("secret_session_key"))
	r.Use(sessions.Sessions("mysession", store))

	// Pass DB to handlers
	h := handlers.NewHandler(gormDB)

	// Add custom template functions
	r.SetFuncMap(template.FuncMap{
		"add": func(a, b int) int {
			return a + b
		},
		"subtract": func(a, b int) int {
			return a - b
		},
	})

	// Load HTML templates
	r.LoadHTMLGlob("templates/**/*")

	// Public routes
	r.GET("/", h.Index)
	r.GET("/login", h.LoginPage)
	r.POST("/login", h.Login)

	// Admin routes
	admin := r.Group("/admin")
	admin.Use(middleware.AuthRequired())
	{
		admin.GET("/", h.AdminDashboard)
		admin.GET("/posts/new", h.NewPostPage)
		admin.POST("/posts", h.CreatePost)
		admin.POST("/logout", h.Logout)
	}

	r.Run(":8083")
}
