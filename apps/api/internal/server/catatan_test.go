package server_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestCatatanDivisi(t *testing.T) {
	e := newEnv(t)
	const q = "/laporan/catatan?dari=2026-11-01&sampai=2026-11-19"
	save := func(role, divisi, isi string) resp {
		return e.call(role, "PUT", "/laporan/catatan", map[string]any{"divisi": divisi, "dari": "2026-11-01", "sampai": "2026-11-19", "isi": isi})
	}
	list := func(role string) map[string]string {
		t.Helper()
		r := e.call(role, "GET", q, nil)
		if r.Code != http.StatusOK {
			t.Fatalf("%s list: %d %s", role, r.Code, r.Message)
		}
		var rows []struct{ Divisi, Isi string }
		_ = json.Unmarshal(r.Data, &rows)
		out := map[string]string{}
		for _, x := range rows {
			out[x.Divisi] = x.Isi
		}
		return out
	}

	for _, c := range []struct {
		role, divisi string
		code         int
	}{
		{"staff", "fo", 200},
		{"doctor", "dokter", 200},
		{"nurse", "terapis", 200},
		{"apoteker", "apotek", 200},
		{"finance", "finance", 200},
		{"admin", "eksekutif", 200},
		{"staff", "finance", 403},
		{"finance", "fo", 403},
		{"doctor", "eksekutif", 403},
		{"admin", "gudang", 400},
	} {
		if r := save(c.role, c.divisi, "Catatan "+c.divisi); r.Code != c.code {
			t.Errorf("%s writes %s: %d %s, want %d", c.role, c.divisi, r.Code, r.Message, c.code)
		}
	}

	// Upsert keeps one note per division and edition.
	if r := save("staff", "fo", "  Kunjungan naik, tambah 1 FO di jam sibuk.  "); r.Code != 200 {
		t.Fatalf("update fo: %d %s", r.Code, r.Message)
	}

	if got := list("admin"); len(got) != 6 || got["fo"] != "Kunjungan naik, tambah 1 FO di jam sibuk." {
		t.Errorf("admin sees %v", got)
	}
	if got := list("finance"); len(got) != 3 || got["fo"] == "" || got["apotek"] == "" || got["finance"] == "" {
		t.Errorf("finance sees %v, want fo, apotek, finance", got)
	}
	if got := list("doctor"); len(got) != 1 || got["dokter"] == "" {
		t.Errorf("doctor sees %v, want only dokter", got)
	}

	// Another edition is separate.
	if r := e.call("staff", "GET", "/laporan/catatan?dari=2026-10-01&sampai=2026-10-31", nil); r.Code != 200 || string(r.Data) != "[]" {
		t.Errorf("other edition: %d %s", r.Code, r.Data)
	}

	// An empty note removes it.
	if r := save("staff", "fo", "   "); r.Code != 200 {
		t.Fatalf("clear fo: %d %s", r.Code, r.Message)
	}
	if got := list("staff"); len(got) != 0 {
		t.Errorf("after clearing, staff sees %v", got)
	}

	if r := e.call("admin", "GET", "/laporan/catatan?dari=2026-11-19&sampai=2026-11-01", nil); r.Code != http.StatusBadRequest {
		t.Errorf("reversed range: %d, want 400", r.Code)
	}
}
