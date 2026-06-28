package handlers

import (
	"net/http"
	"strconv"

	"go-blog/models"

	"github.com/gin-gonic/gin"
)

func (h *Handler) UsersList(c *gin.Context) {
	var users []models.User
	h.DB.Order("created_at desc").Find(&users)

	c.HTML(http.StatusOK, "admin/users_list.html", gin.H{
		"Users": users,
	})
}

func (h *Handler) NewUserPage(c *gin.Context) {
	c.HTML(http.StatusOK, "admin/users_create.html", gin.H{})
}

type CreateUserInput struct {
	Username        string `form:"username" validate:"required"`
	Password        string `form:"password" validate:"required"`
	PasswordConfirm string `form:"password_confirm" validate:"required"`
}

func (h *Handler) CreateUser(c *gin.Context) {
	var input CreateUserInput
	if err := c.ShouldBind(&input); err != nil {
		c.HTML(http.StatusBadRequest, "admin/users_create.html", gin.H{
			"Error":    "Invalid form data",
			"Username": input.Username,
		})
		return
	}

	if err := h.Validate.Struct(input); err != nil {
		c.HTML(http.StatusBadRequest, "admin/users_create.html", gin.H{
			"Error":    "Username and password are required",
			"Username": input.Username,
		})
		return
	}

	if input.Password != input.PasswordConfirm {
		c.HTML(http.StatusBadRequest, "admin/users_create.html", gin.H{
			"Error":    "Passwords do not match",
			"Username": input.Username,
		})
		return
	}

	if _, err := models.CreateUser(h.DB, input.Username, input.Password); err != nil {
		c.HTML(http.StatusInternalServerError, "admin/users_create.html", gin.H{
			"Error":    "Failed to create user (username may already exist)",
			"Username": input.Username,
		})
		return
	}

	c.Redirect(http.StatusFound, "/admin/users")
}

func (h *Handler) EditUserPage(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, "/admin/users")
		return
	}

	var user models.User
	if err := h.DB.First(&user, id).Error; err != nil {
		c.Redirect(http.StatusFound, "/admin/users")
		return
	}

	c.HTML(http.StatusOK, "admin/users_edit.html", gin.H{
		"User": user,
	})
}

type UpdateUserInput struct {
	Username        string `form:"username" validate:"required"`
	Password        string `form:"password"`
	PasswordConfirm string `form:"password_confirm"`
}

func (h *Handler) UpdateUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, "/admin/users")
		return
	}

	var user models.User
	if err := h.DB.First(&user, id).Error; err != nil {
		c.Redirect(http.StatusFound, "/admin/users")
		return
	}

	var input UpdateUserInput
	if err := c.ShouldBind(&input); err != nil {
		c.HTML(http.StatusBadRequest, "admin/users_edit.html", gin.H{
			"Error": "Invalid form data",
			"User":  user,
		})
		return
	}

	if err := h.Validate.Struct(input); err != nil {
		c.HTML(http.StatusBadRequest, "admin/users_edit.html", gin.H{
			"Error": "Username is required",
			"User":  user,
		})
		return
	}

	if input.Password != "" && input.Password != input.PasswordConfirm {
		c.HTML(http.StatusBadRequest, "admin/users_edit.html", gin.H{
			"Error": "Passwords do not match",
			"User":  user,
		})
		return
	}

	user.Username = input.Username
	if input.Password != "" {
		hash, err := models.HashPassword(input.Password)
		if err != nil {
			c.HTML(http.StatusInternalServerError, "admin/users_edit.html", gin.H{
				"Error": "Failed to update password",
				"User":  user,
			})
			return
		}
		user.PasswordHash = hash
	}

	if err := h.DB.Save(&user).Error; err != nil {
		c.HTML(http.StatusInternalServerError, "admin/users_edit.html", gin.H{
			"Error": "Failed to update user (username may already exist)",
			"User":  user,
		})
		return
	}

	c.Redirect(http.StatusFound, "/admin/users")
}

func (h *Handler) DeleteUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, "/admin/users")
		return
	}

	h.DB.Unscoped().Delete(&models.User{}, id)
	c.Redirect(http.StatusFound, "/admin/users")
}
