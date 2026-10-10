package main

import (
	"path/filepath"
	"strings"
	"testing"

	"prom-editor/internal/profile"
	"prom-editor/internal/secrets"
)

func testStore(t *testing.T) *profile.Store {
	t.Helper()
	s, err := profile.NewStoreAt(filepath.Join(t.TempDir(), "profiles.json"))
	if err != nil {
		t.Fatalf("NewStoreAt: %v", err)
	}
	return s
}

func TestStoreSaveListGetDelete(t *testing.T) {
	s := testStore(t)

	pw := "s3cret"
	created, err := s.Save(profile.SaveProfileRequest{
		Name:     "prod",
		Host:     "192.168.1.1",
		Port:     22,
		Username: "ops",
		AuthType: "password",
		Password: &pw,
	})
	if err != nil {
		t.Fatalf("Save(create): %v", err)
	}
	if created.ID == "" {
		t.Fatal("ID 应为空不为空")
	}

	// 更新（不带密码，保留原值）
	created.Name = "prod-renamed"
	updated, err := s.Save(profile.SaveProfileRequest{
		ID:       created.ID,
		Name:     "prod-renamed",
		Host:     created.Host,
		Port:     created.Port,
		Username: created.Username,
		AuthType: "password",
	})
	if err != nil {
		t.Fatalf("Save(update): %v", err)
	}
	if updated.Name != "prod-renamed" || updated.ID != created.ID {
		t.Fatalf("更新结果异常: %+v", updated)
	}

	list := s.List()
	if len(list) != 1 || list[0].Name != "prod-renamed" {
		t.Fatalf("List 异常: %+v", list)
	}

	if err := s.Delete(created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if len(s.List()) != 0 {
		t.Fatal("删除后应为空")
	}
	if _, ok := s.Get(created.ID); ok {
		t.Fatal("Get 应找不到已删除项")
	}
}

func TestStorePersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profiles.json")
	s1, _ := profile.NewStoreAt(path)
	s1.Save(profile.SaveProfileRequest{Name: "a", Host: "h", Port: 22, Username: "u", AuthType: "password"})

	s2, err := profile.NewStoreAt(path)
	if err != nil {
		t.Fatalf("重新加载: %v", err)
	}
	if len(s2.List()) != 1 {
		t.Fatal("持久化后应能读回 1 条")
	}
}

func TestSecretsRoundtrip(t *testing.T) {
	id := "test-" + t.Name()
	if err := secrets.Set(id, "", "value-1"); err != nil {
		t.Skipf("系统钥匙串不可用，跳过: %v", err)
	}
	defer secrets.Delete(id, "")

	v, err := secrets.Get(id, "")
	if err != nil || v != "value-1" {
		t.Fatalf("roundtrip 失败: v=%q err=%v", v, err)
	}
	if err := secrets.Delete(id, ""); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	v, _ = secrets.Get(id, "")
	if v != "" {
		t.Fatal("删除后应为空")
	}
}

func TestTestConnectionUnknownProfile(t *testing.T) {
	app := &App{store: testStore(t)}
	_, err := app.TestConnection("no-such-id")
	if err == nil || !strings.Contains(err.Error(), "不存在") {
		t.Fatalf("应返回配置不存在错误, got: %v", err)
	}
}

func TestSecretOfMissingPassword(t *testing.T) {
	s := testStore(t)
	p, _ := s.Save(profile.SaveProfileRequest{Name: "a", Host: "h", Port: 22, Username: "u", AuthType: "password"})
	app := &App{store: s}
	_, err := app.secretOf(p)
	if err == nil || !strings.Contains(err.Error(), "密码") {
		t.Fatalf("应提示密码未保存, got: %v", err)
	}
}
