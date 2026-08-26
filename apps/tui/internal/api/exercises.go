package api

import (
	"context"
	"net/url"
	"strconv"
)

// ExerciseFetchLimit is the server-side cap on a dictionary search.
// 받은 개수가 이 값이면 **더 있다는 뜻**이다 — 화면이 "전체"라고 말하면 안 된다.
const ExerciseFetchLimit = 200

// Exercise is a canonical exercise from the dictionary.
type Exercise struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Category string   `json:"category"`
	Aliases  []string `json:"aliases,omitempty"`
}

// ExerciseSearch narrows a dictionary lookup. 빈 필드는 보내지 않는다.
type ExerciseSearch struct {
	Query     string
	Category  string
	Equipment string
}

// Exercises searches the exercise dictionary.
//
// ⚠️ **서버가 limit 200으로 자른다.** 카탈로그가 755종이라 빈 검색어로는 사전순
// 앞 200개(알파벳 D까지)밖에 못 받는다 — 나머지 555종은 **검색어를 서버로 보내야만**
// 닿는다. 받아 온 목록을 클라이언트에서 거르는 방식으로는 영원히 안 보인다.
func (c *Client) Exercises(ctx context.Context, search ExerciseSearch) ([]Exercise, error) {
	q := url.Values{}
	if search.Query != "" {
		q.Set("query", search.Query)
	}
	if search.Category != "" {
		q.Set("category", search.Category)
	}
	if search.Equipment != "" {
		q.Set("equipment", search.Equipment)
	}
	q.Set("limit", strconv.Itoa(ExerciseFetchLimit))
	var out struct {
		Items []Exercise `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/exercises?"+q.Encode(), nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// CreateExercise adds a canonical exercise and returns its id (idempotent: an
// existing name returns that row's id with created=false on the server).
func (c *Client) CreateExercise(ctx context.Context, name string) (string, error) {
	var out struct {
		Exercise struct {
			ID string `json:"id"`
		} `json:"exercise"`
	}
	if err := c.do(ctx, "POST", "/api/exercises", map[string]string{"name": name}, &out); err != nil {
		return "", err
	}
	return out.Exercise.ID, nil
}

// RenameExercise changes a canonical exercise's name (409 if the name collides).
func (c *Client) RenameExercise(ctx context.Context, id, name string) error {
	return c.do(ctx, "PATCH", "/api/exercises/"+id, map[string]string{"name": name}, nil)
}

// DeleteExercise removes a canonical exercise from the dictionary.
func (c *Client) DeleteExercise(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/exercises/"+id, nil, nil)
}

// AddAlias maps an alias name onto an exercise (409 if already mapped elsewhere).
func (c *Client) AddAlias(ctx context.Context, exerciseID, alias string) error {
	return c.do(ctx, "POST", "/api/exercises/alias", map[string]string{
		"exerciseId": exerciseID,
		"alias":      alias,
	}, nil)
}
