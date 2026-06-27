package main

import (
	"embed"
	"fmt"
	"html/template"
	"log"
	"os"

	"go-blog/handlers"
	"go-blog/middleware"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/pressly/goose/v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

func databaseDSN() string {
	host := envOrDefault("GO_BLOG_DATABASE_HOST", "shared-postgres")
	port := envOrDefault("GO_BLOG_DATABASE_PORT", "5432")
	user := envOrDefault("GO_BLOG_DATABASE_USER", "goblog")
	dbname := envOrDefault("GO_BLOG_DATABASE_NAME", "goblog")
	password := os.Getenv("GO_BLOG_DATABASE_PASSWORD")

	if password == "" {
		log.Fatal("GO_BLOG_DATABASE_PASSWORD is required")
	}

	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname,
	)
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	dsn := databaseDSN()

	gormDB, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		log.Fatalf("Failed to get database handle: %v", err)
	}
	defer sqlDB.Close()

	goose.SetBaseFS(embedMigrations)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("Failed to set goose dialect: %v", err)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	r := gin.Default()

	store := cookie.NewStore([]byte("secret_session_key"))
	r.Use(sessions.Sessions("mysession", store))

	h := handlers.NewHandler(gormDB)

	r.SetFuncMap(template.FuncMap{
		"add": func(a, b int) int {
			return a + b
		},
		"subtract": func(a, b int) int {
			return a - b
		},
	})

	r.LoadHTMLGlob("templates/**/*")

	r.GET("/", h.Index)
	r.GET("/login", h.LoginPage)
	r.POST("/login", h.Login)

	admin := r.Group("/admin")
	admin.Use(middleware.AuthRequired())
	{
		admin.GET("/", h.AdminDashboard)
		admin.GET("/posts/new", h.NewPostPage)
		admin.POST("/posts", h.CreatePost)
		admin.POST("/logout", h.Logout)
	}

	port := envOrDefault("GO_BLOG_HTTP_PORT", "8083")
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
