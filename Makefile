# storage-app — chạy cả api + web từ apps/, không cần cd.
# Windows: cần `make` (scoop install make). Không có make thì dùng: npm run dev

.PHONY: run api web build install redis stop

run:            ## Dev: Redis + API (nodemon, local) + Web cùng lúc — không dùng Docker
	npm run dev

api:            ## CHỈ backend: build image rồi chạy container Docker (kèm Redis qua docker-compose)
	npm run redis:up
	docker build -t storage-app-api:local ./api
	-docker rm -f storage-app-api
	docker run --rm --name storage-app-api \
		--env-file ./api/.env \
		-e REDIS_HOST=host.docker.internal \
		-e PORT=3000 \
		-p 3000:3000 \
		storage-app-api:local

web:            ## CHỈ frontend (local, không đụng tới api/Docker)
	npm run web

build:          ## Build cả 2
	npm run build

install:        ## Cài deps cho apps + api + web
	npm run install:all

redis:          ## Bật Redis (docker)
	npm run redis:up

stop:           ## Tắt Redis (docker)
	npm run redis:down
