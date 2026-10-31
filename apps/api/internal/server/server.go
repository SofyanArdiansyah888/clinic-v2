package server

import (
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/scaleup/clinic-v2/api/internal/config"
	"github.com/scaleup/clinic-v2/api/internal/modules/antrian"
	"github.com/scaleup/clinic-v2/api/internal/modules/appointment"
	"github.com/scaleup/clinic-v2/api/internal/modules/auth"
	"github.com/scaleup/clinic-v2/api/internal/modules/bank"
	"github.com/scaleup/clinic-v2/api/internal/modules/barang"
	"github.com/scaleup/clinic-v2/api/internal/modules/cabang"
	"github.com/scaleup/clinic-v2/api/internal/modules/dashboard"
	"github.com/scaleup/clinic-v2/api/internal/modules/generate"
	"github.com/scaleup/clinic-v2/api/internal/modules/informedconsent"
	"github.com/scaleup/clinic-v2/api/internal/modules/jadwaldokter"
	"github.com/scaleup/clinic-v2/api/internal/modules/laporan"
	"github.com/scaleup/clinic-v2/api/internal/modules/membership"
	"github.com/scaleup/clinic-v2/api/internal/modules/pasien"
	"github.com/scaleup/clinic-v2/api/internal/modules/pembayaran"
	"github.com/scaleup/clinic-v2/api/internal/modules/pembelian"
	"github.com/scaleup/clinic-v2/api/internal/modules/pengaturan"
	"github.com/scaleup/clinic-v2/api/internal/modules/penjualan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perawatan"
	"github.com/scaleup/clinic-v2/api/internal/modules/perusahaan"
	"github.com/scaleup/clinic-v2/api/internal/modules/promo"
	"github.com/scaleup/clinic-v2/api/internal/modules/staff"
	"github.com/scaleup/clinic-v2/api/internal/modules/supplier"
	"github.com/scaleup/clinic-v2/api/internal/modules/treatment"
	"github.com/scaleup/clinic-v2/api/internal/modules/upload"
	"github.com/scaleup/clinic-v2/api/internal/modules/user"
	"github.com/scaleup/clinic-v2/api/internal/modules/voucher"
	"github.com/scaleup/clinic-v2/api/internal/modules/warehouse"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/jwt"
	"github.com/scaleup/clinic-v2/api/internal/platform/middleware"
	"github.com/scaleup/clinic-v2/api/internal/platform/response"
	"github.com/scaleup/clinic-v2/api/internal/platform/storage"
	"gorm.io/gorm"
)

func New(cfg *config.Config, db *gorm.DB, jm *jwt.Manager, gen *generator.Service) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	store, err := storage.NewLocalStore(cfg.StorageLocalDir, cfg.StoragePublicBase)
	if err != nil {
		panic("storage: " + err.Error())
	}
	// STORAGE_DRIVER=minio can be wired later against the same storage.Store interface.
	_ = cfg.StorageDriver

	r := gin.Default()
	r.MaxMultipartMemory = 12 << 20
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if origin == cfg.CORSOrigin {
				return true
			}
			// Vite may bind 5173, 5174, ... in local dev
			return len(origin) >= 16 &&
				(origin[:16] == "http://localhost" || origin[:17] == "http://127.0.0.1")
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	r.GET("/health", func(c *gin.Context) {
		response.OK(c, gin.H{"status": "ok"}, "healthy")
	})
	r.GET("/api/health", func(c *gin.Context) {
		response.OK(c, gin.H{"status": "ok"}, "healthy")
	})

	api := r.Group("/api")
	auth.RegisterPublicRoutes(api, db, jm)
	// Public file serve so <img src> works without Authorization header.
	// Upload remains protected.
	{
		uh := upload.NewHandler(store)
		api.GET("/uploads/files/*key", uh.Serve)
	}

	protected := api.Group("")
	protected.Use(middleware.Auth(jm))
	{
		auth.RegisterProtectedRoutes(protected, db, jm)
		generate.RegisterRoutes(protected, gen)
		dashboard.RegisterRoutes(protected, db)
		upload.RegisterRoutes(protected, store)

		user.RegisterRoutes(protected, db, gen)
		pasien.RegisterRoutes(protected, db, gen)
		staff.RegisterRoutes(protected, db, gen)
		treatment.RegisterRoutes(protected, db, gen)
		supplier.RegisterRoutes(protected, db, gen)
		bank.RegisterRoutes(protected, db, gen)
		perusahaan.RegisterRoutes(protected, db, gen)
		cabang.RegisterRoutes(protected, db, gen)
		barang.RegisterRoutes(protected, db, gen)

		antrian.RegisterRoutes(protected, db, gen)
		appointment.RegisterRoutes(protected, db, gen)
		perawatan.RegisterRoutes(protected, db, gen)
		penjualan.RegisterRoutes(protected, db, gen)
		pembayaran.RegisterRoutes(protected, db, gen)
		pembelian.RegisterRoutes(protected, db, gen)
		warehouse.RegisterRoutes(protected, db, gen)

		membership.RegisterRoutes(protected, db, gen)
		voucher.RegisterRoutes(protected, db, gen)
		promo.RegisterRoutes(protected, db, gen)

		jadwaldokter.RegisterRoutes(protected, db)
		informedconsent.RegisterRoutes(protected, db)
		pengaturan.RegisterRoutes(protected, db)
		laporan.RegisterRoutes(protected, db)
	}

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "route not found"})
	})

	return r
}
