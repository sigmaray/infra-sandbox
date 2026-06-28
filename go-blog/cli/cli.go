package cli

import (
	"bufio"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"

	"go-blog/models"

	"gorm.io/gorm"
)

func Run(db *gorm.DB, args []string) {
	if len(args) == 0 {
		PrintUsage()
		os.Exit(1)
	}

	switch args[0] {
	case "users-seed":
		usersSeed(db)
	case "users-create":
		usersCreate(db)
	case "users-show":
		usersShow(db)
	case "users-clear":
		usersClear(db)
	case "posts-show":
		postsShow(db)
	case "posts-seed":
		count := 10
		if len(args) > 1 {
			if _, err := fmt.Sscanf(args[1], "%d", &count); err != nil || count < 1 {
				log.Fatalf("Invalid count: %s", args[1])
			}
		}
		postsSeed(db, count)
	case "posts-clear":
		postsClear(db)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", args[0])
		PrintUsage()
		os.Exit(1)
	}
}

func PrintUsage() {
	fmt.Println(`Usage: blog <command>

Server:
  s, server               Start the HTTP server

User commands:
  users-seed              Create admin user (admin/admin)
  users-create            Create a user interactively
  users-show              List all users
  users-clear             Delete all users

Post commands:
  posts-show              List all posts
  posts-seed [count]      Generate random posts with tags (default: 10)
  posts-clear             Delete all posts and tags`)
}

func usersSeed(db *gorm.DB) {
	existing, err := models.FindUserByUsername(db, "admin")
	if err != nil {
		log.Fatalf("Failed to check admin user: %v", err)
	}
	if existing != nil {
		fmt.Println("User 'admin' already exists")
		return
	}

	user, err := models.CreateUser(db, "admin", "admin")
	if err != nil {
		log.Fatalf("Failed to create admin user: %v", err)
	}
	fmt.Printf("Created user: id=%d username=%s\n", user.ID, user.Username)
}

func usersCreate(db *gorm.DB) {
	reader := bufio.NewReader(os.Stdin)

	username := readLine(reader, "Login: ")
	if username == "" {
		log.Fatal("Login is required")
	}

	password := readPassword(reader, "Password: ")
	if password == "" {
		log.Fatal("Password is required")
	}

	confirm := readPassword(reader, "Confirm password: ")
	if password != confirm {
		log.Fatal("Passwords do not match")
	}

	user, err := models.CreateUser(db, username, password)
	if err != nil {
		log.Fatalf("Failed to create user: %v", err)
	}

	fmt.Printf("Created user: id=%d username=%s\n", user.ID, user.Username)
}

func usersShow(db *gorm.DB) {
	var users []models.User
	if err := db.Order("id asc").Find(&users).Error; err != nil {
		log.Fatalf("Failed to fetch users: %v", err)
	}

	if len(users) == 0 {
		fmt.Println("No users found.")
		return
	}

	fmt.Printf("%-5s %-20s %-20s\n", "ID", "Username", "Created At")
	fmt.Println(strings.Repeat("-", 47))
	for _, user := range users {
		fmt.Printf("%-5d %-20s %-20s\n", user.ID, user.Username, user.CreatedAt.Format("2006-01-02 15:04"))
	}
}

func usersClear(db *gorm.DB) {
	result := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&models.User{})
	if result.Error != nil {
		log.Fatalf("Failed to clear users: %v", result.Error)
	}
	fmt.Printf("Deleted %d user(s).\n", result.RowsAffected)
}

func postsShow(db *gorm.DB) {
	var posts []models.Post
	if err := db.Preload("Tags").Order("id asc").Find(&posts).Error; err != nil {
		log.Fatalf("Failed to fetch posts: %v", err)
	}

	if len(posts) == 0 {
		fmt.Println("No posts found.")
		return
	}

	fmt.Printf("%-5s %-30s %-20s %s\n", "ID", "Title", "Created At", "Tags")
	fmt.Println(strings.Repeat("-", 80))
	for _, post := range posts {
		title := post.Title
		if title == "" {
			title = "(untitled)"
		}
		if len(title) > 28 {
			title = title[:28] + ".."
		}

		tagNames := make([]string, len(post.Tags))
		for i, tag := range post.Tags {
			tagNames[i] = tag.Name
		}

		fmt.Printf("%-5d %-30s %-20s %s\n",
			post.ID,
			title,
			post.CreatedAt.Format("2006-01-02 15:04"),
			strings.Join(tagNames, ", "),
		)
	}
}

func postsSeed(db *gorm.DB, count int) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	titles := []string{
		"Getting Started with Go",
		"Building REST APIs",
		"Database Migrations 101",
		"Understanding Goroutines",
		"Web Development Tips",
		"Docker for Developers",
		"Testing Best Practices",
		"Clean Code in Go",
		"Deploying to Production",
		"Introduction to Gin",
		"PostgreSQL Performance",
		"Session-Based Auth",
	}

	contents := []string{
		"This post covers the fundamentals and practical examples.",
		"A deep dive into patterns and common pitfalls.",
		"Step-by-step guide with code snippets.",
		"Everything you need to know to get productive quickly.",
		"Lessons learned from real-world projects.",
	}

	tagPool := []string{"go", "web", "tutorial", "news", "devops", "database", "api", "docker", "testing", "gin"}

	for i := 0; i < count; i++ {
		title := titles[rng.Intn(len(titles))] + fmt.Sprintf(" #%d", i+1)
		content := contents[rng.Intn(len(contents))]

		post := models.Post{
			Title:   title,
			Content: content,
		}

		tagCount := rng.Intn(3) + 1
		usedTags := make(map[string]bool)
		for j := 0; j < tagCount; j++ {
			tagName := tagPool[rng.Intn(len(tagPool))]
			if usedTags[tagName] {
				continue
			}
			usedTags[tagName] = true

			var tag models.Tag
			if err := db.Where("name = ?", tagName).FirstOrCreate(&tag, models.Tag{Name: tagName}).Error; err != nil {
				log.Fatalf("Failed to create tag: %v", err)
			}
			post.Tags = append(post.Tags, tag)
		}

		if err := db.Create(&post).Error; err != nil {
			log.Fatalf("Failed to create post: %v", err)
		}

		tagNames := make([]string, len(post.Tags))
		for k, tag := range post.Tags {
			tagNames[k] = tag.Name
		}
		fmt.Printf("Created post id=%d title=%q tags=[%s]\n", post.ID, post.Title, strings.Join(tagNames, ", "))
	}
}

func postsClear(db *gorm.DB) {
	if err := db.Exec("DELETE FROM post_tags").Error; err != nil {
		log.Fatalf("Failed to clear post_tags: %v", err)
	}

	postResult := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&models.Post{})
	if postResult.Error != nil {
		log.Fatalf("Failed to clear posts: %v", postResult.Error)
	}

	tagResult := db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&models.Tag{})
	if tagResult.Error != nil {
		log.Fatalf("Failed to clear tags: %v", tagResult.Error)
	}

	fmt.Printf("Deleted %d post(s) and %d tag(s).\n", postResult.RowsAffected, tagResult.RowsAffected)
}

func readLine(reader *bufio.Reader, prompt string) string {
	fmt.Print(prompt)
	line, err := reader.ReadString('\n')
	if err != nil {
		log.Fatalf("Failed to read input: %v", err)
	}
	return strings.TrimSpace(line)
}

func readPassword(reader *bufio.Reader, prompt string) string {
	fmt.Print(prompt)
	line, err := reader.ReadString('\n')
	if err != nil {
		log.Fatalf("Failed to read input: %v", err)
	}
	return strings.TrimSpace(line)
}
