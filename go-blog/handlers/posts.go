package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"go-blog/models"

	"github.com/gin-gonic/gin"
)

func (h *Handler) EditPostPage(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, "/admin/")
		return
	}

	var post models.Post
	if err := h.DB.Preload("Tags").First(&post, id).Error; err != nil {
		c.Redirect(http.StatusFound, "/admin/")
		return
	}

	c.HTML(http.StatusOK, "admin/edit_post.html", gin.H{
		"Post": post,
		"Tags": formatTagNames(post.Tags),
	})
}

type UpdatePostInput struct {
	Title   string `form:"title"`
	Content string `form:"content" validate:"required"`
	Tags    string `form:"tags"`
}

func (h *Handler) UpdatePost(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, "/admin/")
		return
	}

	var post models.Post
	if err := h.DB.Preload("Tags").First(&post, id).Error; err != nil {
		c.Redirect(http.StatusFound, "/admin/")
		return
	}

	var input UpdatePostInput
	if err := c.ShouldBind(&input); err != nil {
		c.HTML(http.StatusBadRequest, "admin/edit_post.html", gin.H{
			"Error":   "Invalid form data",
			"Post":    post,
			"Title":   input.Title,
			"Content": input.Content,
			"Tags":    input.Tags,
		})
		return
	}

	if err := h.Validate.Struct(input); err != nil {
		c.HTML(http.StatusBadRequest, "admin/edit_post.html", gin.H{
			"Error":   "Content is required",
			"Post":    post,
			"Title":   input.Title,
			"Content": input.Content,
			"Tags":    input.Tags,
		})
		return
	}

	post.Title = input.Title
	post.Content = input.Content

	tags, err := h.buildTags(input.Tags)
	if err != nil {
		c.HTML(http.StatusInternalServerError, "admin/edit_post.html", gin.H{
			"Error":   "Failed to process tags",
			"Post":    post,
			"Title":   input.Title,
			"Content": input.Content,
			"Tags":    input.Tags,
		})
		return
	}

	if err := h.DB.Save(&post).Error; err != nil {
		c.HTML(http.StatusInternalServerError, "admin/edit_post.html", gin.H{
			"Error":   "Failed to update post",
			"Post":    post,
			"Title":   input.Title,
			"Content": input.Content,
			"Tags":    input.Tags,
		})
		return
	}

	if err := h.DB.Model(&post).Association("Tags").Replace(tags); err != nil {
		c.HTML(http.StatusInternalServerError, "admin/edit_post.html", gin.H{
			"Error":   "Failed to update tags",
			"Post":    post,
			"Title":   input.Title,
			"Content": input.Content,
			"Tags":    input.Tags,
		})
		return
	}

	c.Redirect(http.StatusFound, "/admin/")
}

func (h *Handler) DeletePost(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, "/admin/")
		return
	}

	var post models.Post
	if err := h.DB.First(&post, id).Error; err != nil {
		c.Redirect(http.StatusFound, "/admin/")
		return
	}

	h.DB.Select("Tags").Delete(&post)
	c.Redirect(http.StatusFound, "/admin/")
}

func (h *Handler) buildTags(tagsInput string) ([]models.Tag, error) {
	if tagsInput == "" {
		return nil, nil
	}

	tagNames := strings.Split(tagsInput, ",")
	var tags []models.Tag

	for _, name := range tagNames {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}

		var tag models.Tag
		if err := h.DB.Where("name = ?", name).FirstOrCreate(&tag, models.Tag{Name: name}).Error; err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}

	return tags, nil
}

func formatTagNames(tags []models.Tag) string {
	names := make([]string, len(tags))
	for i, tag := range tags {
		names[i] = tag.Name
	}
	return strings.Join(names, ", ")
}
