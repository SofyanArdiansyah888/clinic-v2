package voucher

import "testing"

func TestPotongan(t *testing.T) {
	cases := []struct {
		tipe         string
		nilai, total float64
		want         float64
	}{
		{"nominal", 20000, 100000, 20000},
		{"percent", 10, 370000, 37000},
		{"nominal", 50000, 30000, 30000}, // never more than the total
		{"percent", 150, 10000, 10000},
		{"nominal", -5000, 10000, 0},
	}
	for _, c := range cases {
		v := Voucher{TipeDiskon: c.tipe, NilaiDiskon: c.nilai}
		if got := v.Potongan(c.total); got != c.want {
			t.Errorf("%s %v of %v = %v, want %v", c.tipe, c.nilai, c.total, got, c.want)
		}
	}
}
