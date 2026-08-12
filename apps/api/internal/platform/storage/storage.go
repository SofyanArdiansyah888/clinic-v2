package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Object is the result of a successful upload.
// URL is what clients store in DB (foto_sebelum, etc.).
// For MinIO later, Put should return a public/presigned-compatible path.
type Object struct {
	Key         string `json:"key"`
	URL         string `json:"url"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}

// Store abstracts object storage. Local now; MinIO can implement the same interface
// without embedding MinIO server in this repo.
type Store interface {
	Put(ctx context.Context, folder string, filename string, r io.Reader, size int64, contentType string) (*Object, error)
	LocalDir() string
	PublicBasePath() string
}

type LocalStore struct {
	RootDir  string
	BasePath string // e.g. /api/uploads/files
}

func NewLocalStore(rootDir, basePath string) (*LocalStore, error) {
	if rootDir == "" {
		rootDir = "./storage/uploads"
	}
	if basePath == "" {
		basePath = "/api/uploads/files"
	}
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return nil, err
	}
	return &LocalStore{RootDir: rootDir, BasePath: strings.TrimRight(basePath, "/")}, nil
}

func (s *LocalStore) LocalDir() string       { return s.RootDir }
func (s *LocalStore) PublicBasePath() string { return s.BasePath }

func randomID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *LocalStore) Put(ctx context.Context, folder, filename string, r io.Reader, size int64, contentType string) (*Object, error) {
	_ = ctx
	_ = size
	folder = sanitizePath(folder)
	ext := filepath.Ext(filename)
	if ext == "" {
		ext = extFromContentType(contentType)
	}
	name := randomID() + strings.ToLower(ext)
	day := time.Now().Format("2006/01/02")
	rel := filepath.ToSlash(filepath.Join(folder, day, name))
	abs := filepath.Join(s.RootDir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return nil, err
	}
	f, err := os.Create(abs)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	written, err := io.Copy(f, r)
	if err != nil {
		_ = os.Remove(abs)
		return nil, err
	}

	return &Object{
		Key:         rel,
		URL:         s.BasePath + "/" + rel,
		Filename:    filename,
		ContentType: contentType,
		Size:        written,
	}, nil
}

func sanitizePath(p string) string {
	p = strings.Trim(p, "/\\ ")
	p = strings.ReplaceAll(p, "..", "")
	if p == "" {
		return "misc"
	}
	return p
}

func extFromContentType(ct string) string {
	switch strings.ToLower(ct) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".bin"
	}
}

// ResolveLocalPath maps a public key/path segment to a local file.
func (s *LocalStore) ResolveLocalPath(key string) (string, error) {
	key = strings.TrimPrefix(key, "/")
	key = strings.TrimPrefix(key, strings.TrimPrefix(s.BasePath, "/")+"/")
	key = filepath.Clean(filepath.FromSlash(key))
	if strings.HasPrefix(key, "..") {
		return "", fmt.Errorf("invalid key")
	}
	abs := filepath.Join(s.RootDir, key)
	root := filepath.Clean(s.RootDir)
	if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid key")
	}
	return abs, nil
}
