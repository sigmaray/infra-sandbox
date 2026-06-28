package database

import (
	"embed"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func LoadEnv() {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Printf("Warning: failed to load .env: %v", err)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func DSN() string {
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

func Connect() *gorm.DB {
	db, err := gorm.Open(postgres.Open(DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	return db
}

func RunMigrations(migrations embed.FS) {
	db := Connect()

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get database handle: %v", err)
	}
	defer sqlDB.Close()

	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("Failed to set goose dialect: %v", err)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
}

func ConnectAndMigrate(migrations embed.FS) *gorm.DB {
	db := Connect()

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get database handle: %v", err)
	}

	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("Failed to set goose dialect: %v", err)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	return db
}
