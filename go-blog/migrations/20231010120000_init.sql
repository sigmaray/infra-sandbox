-- +goose Up
-- +goose StatementBegin
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    title TEXT,
    content TEXT NOT NULL
);

CREATE INDEX idx_posts_deleted_at ON posts(deleted_at);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    name TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_deleted_at ON tags(deleted_at);

CREATE TABLE post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE post_tags;
DROP TABLE tags;
DROP TABLE posts;
-- +goose StatementEnd
