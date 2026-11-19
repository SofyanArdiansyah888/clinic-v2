package finance

import (
	"testing"
	"time"
)

func TestShiftPeriod(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse(dateFmt, s); return v }
	cases := []struct{ dari, sampai, wantDari, wantSampai string }{
		{"2026-11-01", "2026-11-19", "2026-10-01", "2026-10-19"}, // month to date
		{"2026-11-01", "2026-11-30", "2026-10-01", "2026-10-31"}, // whole month -> whole month
		{"2026-03-01", "2026-03-30", "2026-02-01", "2026-02-28"}, // day past February's end clamps
		{"2026-01-01", "2026-03-31", "2025-10-01", "2025-12-31"}, // quarter
		{"2026-11-05", "2026-11-14", "2026-10-26", "2026-11-04"}, // arbitrary range: same length, touching
	}
	for _, c := range cases {
		gd, gs := shiftPeriod(d(c.dari), d(c.sampai))
		if gd.Format(dateFmt) != c.wantDari || gs.Format(dateFmt) != c.wantSampai {
			t.Errorf("shiftPeriod(%s, %s) = %s, %s; want %s, %s", c.dari, c.sampai, gd.Format(dateFmt), gs.Format(dateFmt), c.wantDari, c.wantSampai)
		}
	}
}

func TestYearBack(t *testing.T) {
	d := func(s string) time.Time { v, _ := time.Parse(dateFmt, s); return v }
	for in, want := range map[string]string{
		"2026-11-19": "2025-11-19",
		"2028-02-29": "2027-02-28",
		"2027-02-28": "2026-02-28",
		"2026-11-30": "2025-11-30",
	} {
		if got := yearBack(d(in)).Format(dateFmt); got != want {
			t.Errorf("yearBack(%s) = %s, want %s", in, got, want)
		}
	}
}
