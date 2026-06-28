package main

import (
	"embed"
	"html/template"
	"log"
	"net/http"
	"os"

	"go-blog/cli"
	"go-blog/database"
	"go-blog/handlers"
	"go-blog/middleware"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

func main() {
	database.LoadEnv()

	if len(os.Args) < 2 {
		cli.PrintUsage()
		return
	}

	switch os.Args[1] {
	case "s", "server":
		runServer()
	default:
		db := database.ConnectAndMigrate(embedMigrations)
		cli.Run(db, os.Args[1:])
	}
}

func sessionSecret() []byte {
	secret := os.Getenv("GO_BLOG_SESSION_SECRET")
	if secret == "" {
		log.Fatal("GO_BLOG_SESSION_SECRET is required")
	}
	if len(secret) < 32 {
		log.Fatal("GO_BLOG_SESSION_SECRET must be at least 32 characters")
	}
	return []byte(secret)
}

func sessionSecure() bool {
	return os.Getenv("GO_BLOG_SESSION_SECURE") == "1" || os.Getenv("GO_BLOG_SESSION_SECURE") == "true"
}

func runServer() {
	gormDB := database.ConnectAndMigrate(embedMigrations)

	r := gin.Default()

	store := cookie.NewStore(sessionSecret())
	store.Options(sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 30,
		HttpOnly: true,
		Secure:   sessionSecure(),
		SameSite: http.SameSiteLaxMode,
	})
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
		admin.GET("/posts/:id/edit", h.EditPostPage)
		admin.POST("/posts/:id", h.UpdatePost)
		admin.POST("/posts/:id/delete", h.DeletePost)
		admin.GET("/users", h.UsersList)
		admin.GET("/users/new", h.NewUserPage)
		admin.POST("/users", h.CreateUser)
		admin.GET("/users/:id/edit", h.EditUserPage)
		admin.POST("/users/:id", h.UpdateUser)
		admin.POST("/users/:id/delete", h.DeleteUser)
		admin.POST("/logout", h.Logout)
	}

	port := os.Getenv("GO_BLOG_HTTP_PORT")
	if port == "" {
		port = "8083"
	}
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
