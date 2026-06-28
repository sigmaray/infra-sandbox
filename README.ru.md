# infra-sandbox

Песочница инфраструктуры на Docker: небольшой набор сервисов для VPS или локальной разработки. В стек входят общая база PostgreSQL, RSS-читалка FreshRSS, статический сервер с тестовыми лентами, блог на Go, Portainer (веб-интерфейс для Docker), pgAdmin (веб-интерфейс для PostgreSQL) и reverse proxy на Caddy.

**[English version →](README.md)**

---

## Что это?

Репозиторий решает две задачи:

1. **Готовый к развёртыванию стек** — набор Docker Compose-проектов для установки на VPS DigitalOcean (рекомендуется 4 ГБ RAM).
2. **Набор интеграционных тестов** — end-to-end проверки на Playwright, что все сервисы работают вместе.

Все сервисы используют один экземпляр PostgreSQL и общую Docker-сеть `projects-net`.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           Docker-сеть: projects-net                              │
│                                                                                  │
│  ┌──────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ shared-      │   │ FreshRSS │   │ go-blog  │   │ pgAdmin  │   │ pg-backup│    │
│  │ postgres     │◄──│ :8081    │   │ :8083    │   │ :8085    │   │ (cron)   │    │
│  │              │   │          │   │          │   └──────────┘   └───┬──────┘    │
│  │ БД freshrss  │   └────┬─────┘   └────┬─────┘                      │           │
│  │ БД goblog    │        │              │                            ▼           │
│  └──────▲───────┘        │ подписка на  │                     ┌──────────────┐   │
│         │                ▼              ▼                     │ s3-storage   │   │
│         │          ┌──────────────┐  ┌──────────────┐         │ (MinIO)      │   │
│         │          │ static-server│  │ Caddy        │         │ :9002 (API)  │   │
│         │          │ (nginx)      │  │ :80          │         │ :9003 (UI)   │   │
│         │          │ :8082        │  └──────────────┘         └──────────────┘   │
│         │          └──────────────┘                                              │
│         │          ┌──────────────┐  ┌──────────────┐         ┌──────────────┐   │
│         └──────────│ Portainer    │  │ wg-easy      │         │ http-proxy   │   │
│                    │ :8084        │  │ :51821 (UI)  │         │ :3128 (HTTP) │   │
│                    └──────────────┘  │ :51820 (UDP) │         │ :1080 (SOCKS)│   │
│                                      └──────────────┘         └──────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Сервисы и порты по умолчанию

| Сервис             | Имя контейнера   | Порт | Описание                                 |
|--------------------|------------------|------|------------------------------------------|
| PostgreSQL         | `shared-postgres`| —    | Общая БД для FreshRSS и go-blog          |
| FreshRSS           | `freshrss`       | 8081 | Самостоятельно размещаемая RSS-читалка   |
| Статический сервер | `static-server`  | 8082 | Nginx с тестовыми RSS-лентами            |
| Go Blog            | `go-blog`        | 8083 | Простой блог на Go (Gin + GORM)          |
| Portainer          | `portainer`      | 8084 | Веб-интерфейс для управления Docker      |
| pgAdmin            | `pgadmin`        | 8085 | Веб-интерфейс для администрирования PostgreSQL |
| Reverse Proxy      | `reverse-proxy`  | 80   | Caddy для маршрутизации `*.localhost`    |
| S3 Storage         | `s3-storage`     | 9002/9003 | MinIO объектное хранилище (API / Console) |
| PG Backup          | `pg-backup`      | —    | Автоматические бэкапы PostgreSQL в MinIO |
| WireGuard          | `wg-easy`        | 51821/51820 | WireGuard VPN-сервер с веб-интерфейсом |
| HTTP Proxy         | `http-proxy`     | 3128/1080 | 3proxy HTTP и SOCKS5 прокси          |

Порты можно изменить через переменные окружения (см. [Конфигурация](#конфигурация)).

---

## Требования

- **Docker** и **Docker Compose** (плагин v2)
- **Node.js** 18+ и **npm** (для локального запуска тестов)
- Для VPS: Ubuntu или Debian, доступ root/sudo, ~4 ГБ RAM

---

## Быстрый старт (локально)

### 1. Клонировать репозиторий

```bash
git clone https://github.com/sigmaray/infra-sandbox.git
cd infra-sandbox
```

### 2. Установить зависимости для тестов

```bash
npm ci
npx playwright install --with-deps chromium
```

### 3. Запустить стек

```bash
npm run stack:up
```

Скрипт:

- создаёт тестовые `.env` с известными паролями;
- создаёт Docker-сеть `projects-net`;
- запускает сервисы в правильном порядке (сначала PostgreSQL);
- ждёт, пока контейнеры станут готовы.

### 4. Открыть сервисы в браузере

| Сервис    | URL                          | Логин по умолчанию     |
|-----------|------------------------------|------------------------|
| FreshRSS  | http://127.0.0.1:8081        | `admin` / `test-admin`                    |
| Go Blog   | http://127.0.0.1:8083        | `admin` / `admin`                         |
| RSS-ленты | http://127.0.0.1:8082/feeds/ | — (без авторизации)                       |
| Portainer | http://127.0.0.1:8084        | `admin` / `test-portainer-admin-password` |
| pgAdmin   | http://127.0.0.1:8085        | `admin@example.com` / `test-pgadmin`      |
| S3 Console| http://127.0.0.1:9003        | `test-minio-admin` / `test-minio-password`|
| WireGuard | http://127.0.0.1:51821       | `test-wg-easy-password`                   |
| HTTP Proxy| 127.0.0.1:3128               | `test-proxy-user` / `test-proxy-password` |
| SOCKS Proxy| 127.0.0.1:1080              | `test-proxy-user` / `test-proxy-password` |

Те же сервисы доступны через Caddy на 80 порту: `freshrss.localhost`, `feeds.localhost`, `blog.localhost`, `portainer.localhost` и `pgadmin.localhost` (или альтернативные `*.sigmalocal` — см. `reverse-proxy/.env.example`).

**Portainer** подключается к локальному Docker через `/var/run/docker.sock` и показывает все контейнеры стека. При первом запуске `stack-up.sh` автоматически создаёт учётную запись администратора (тестовые данные выше).

**pgAdmin** поставляется с преднастроенным подключением к `shared-postgres` через `pgadmin/servers.json` (создаётся из `servers.json.example` скриптами `stack-up.sh` или `generate-env-files.sh`). После входа раскройте **Servers → shared-postgres**, чтобы просмотреть базы (`freshrss`, `goblog` и др.). Держите `servers.json` в синхронизации с `POSTGRES_PASSWORD` из `postgresql/.env`.

### 5. Запустить тесты

```bash
npm test
```

Полный цикл (остановка → запуск → тесты → остановка):

```bash
npm run test:infra
```

### 6. Остановить стек

```bash
npm run stack:down
```

Контейнеры и **тома** удаляются — следующий запуск начнётся с чистого состояния.

---

## Развёртывание на VPS

Рассчитано на дроплет DigitalOcean с 4 ГБ RAM. Скрипт установки также создаёт swap-файл на 2 ГБ.

### 1. Клонировать на сервер

```bash
git clone git@github.com:sigmaray/infra-sandbox.git ~/infra-sandbox
cd ~/infra-sandbox
```

### 2. Запустить скрипт установки (от root)

```bash
sudo REPO_DIR=~/infra-sandbox ./scripts/setup-vps.sh
```

Скрипт:

- устанавливает Docker (Ubuntu/Debian);
- создаёт swap-файл 2 ГБ;
- копирует файлы проектов в `/opt/projects/`;
- создаёт Docker-сеть `projects-net`;
- генерирует `.env` из шаблонов `.env.example`;
- добавляет вашего пользователя в группу `docker`.

**Важно:** перед продакшеном отредактируйте `.env` в `/opt/projects/*/` и задайте надёжные пароли.

### 3. Запустить сервисы (по порядку)

```bash
cd /opt/projects/postgresql && docker compose up -d
cd /opt/projects/s3-storage && docker compose up -d
cd /opt/projects/freshrss   && docker compose up -d
cd /opt/projects/static-server && docker compose up -d
cd /opt/projects/go-blog    && docker compose up -d
cd /opt/projects/pgadmin    && docker compose up -d
cd /opt/projects/portainer  && docker compose up -d
cd /opt/projects/wg-easy    && docker compose up -d
cd /opt/projects/http-proxy && docker compose up -d
cd /opt/projects/reverse-proxy && docker compose up -d
cd /opt/projects/pg-backup  && docker compose up -d
```

### 4. Обновление после изменений в коде

```bash
REPO_DIR=~/infra-sandbox ./scripts/update-projects.sh
```

Скрипт подтягивает код из git, синхронизирует файлы в `/opt/projects/` и перезапускает только изменившиеся сервисы.

Полезные флаги:

| Переменная        | Эффект                                           |
|-------------------|--------------------------------------------------|
| `FORCE_RESTART=1` | Перезапустить все сервисы                        |
| `PULL_IMAGES=1`   | Скачать свежие образы перед перезапуском         |
| `SKIP_GIT_PULL=1` | Синхронизировать и перезапустить без `git pull`  |
| `SKIP_RESTART=1`  | Только синхронизация файлов, без перезапуска     |
| `DRY_RUN=1`       | Показать план действий без выполнения            |
| `PROJECTS="freshrss go-blog"` | Обновить только выбранные проекты   |

---

## Конфигурация

У каждого сервиса своя папка с `docker-compose.yml` и `.env.example`. Скопируйте `.env.example` в `.env` и измените значения.

### PostgreSQL (`postgresql/.env`)

При первом запуске создаёт две базы: `freshrss` и `goblog`. У каждой — отдельный пользователь.

### FreshRSS (`freshrss/.env`)

- `FRESHRSS_BASE_URL` — публичный URL вашего FreshRSS (обязательно для продакшена)
- Учётные данные администратора и пароль API
- `FRESHRSS_HTTP_PORT` — порт на хосте (по умолчанию `8081`)

### Go Blog (`go-blog/.env`)

- Подключение к БД (по умолчанию `shared-postgres`)
- `GO_BLOG_HTTP_PORT` — порт на хосте (по умолчанию `8083`)

### Статический сервер (`static-server/`)

- `STATIC_SERVER_HTTP_PORT` — порт на хосте (по умолчанию `8082`)
- RSS-файлы лежат в `static-server/content/feeds/`
- `content/manifest.json` описывает ленты для автоматических тестов

### Portainer (`portainer/.env`)

- `PORTAINER_HTTP_PORT` — порт на хосте (по умолчанию `8084`)
- Монтирует `/var/run/docker.sock` для управления контейнерами на хосте
- При первом входе создайте учётную запись администратора (в тестовом/CI окружении это делает `stack-up.sh`)

### pgAdmin (`pgadmin/.env`)

- `PGADMIN_HTTP_PORT` — порт на хосте (по умолчанию `8085`)
- `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` — учётные данные для входа
- `PGADMIN_CONFIG_SERVER_MODE` — многопользовательский режим (по умолчанию `True`)
- `PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED` — отключить запрос master password для локального использования (по умолчанию `False`)
- `PGADMIN_SERVER_*` — учётные данные для преднастроенного подключения к PostgreSQL в `servers.json`

Шаблон `pgadmin/servers.json.example` описывает сервер `shared-postgres`. Скрипт `generate-env-files.sh` создаёт `servers.json` со случайным паролем; поле `Password` должно совпадать с `POSTGRES_PASSWORD` из `postgresql/.env`.

### Reverse Proxy (`reverse-proxy/.env`)

- `FRESHRSS_HOST`, `FEEDS_HOST`, `BLOG_HOST` — основные хосты, которые обслуживает Caddy
- `FRESHRSS_ALT_HOST`, `FEEDS_ALT_HOST`, `BLOG_ALT_HOST` — альтернативные хосты (по умолчанию `*.sigmalocal`; настройте резолвинг через `/etc/hosts` или локальный DNS)
- `PORTAINER_HOST`, `PGADMIN_HOST` — хосты для Portainer и pgAdmin
- `PORTAINER_ALT_HOST`, `PGADMIN_ALT_HOST` — альтернативные хосты (по умолчанию `portainer.sigmalocal`, `pgadmin.sigmalocal`)
- `CADDY_HTTP_PORT` — порт reverse proxy на хосте (по умолчанию `80`)

### S3 Storage (`s3-storage/.env`)

- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — учётные данные администратора
- `MINIO_API_PORT` — порт на хосте для API (по умолчанию `9002`)
- `MINIO_CONSOLE_PORT` — порт на хосте для веб-интерфейса (по умолчанию `9003`)

### PG Backup (`pg-backup/.env`)

- `POSTGRES_PASSWORD` — пароль пользователя `postgres` (должен совпадать с `postgresql/.env`)
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — учётные данные MinIO для загрузки бэкапов
- Использует cron для ежедневного дампа всех баз данных и загрузки в MinIO.

### WireGuard (`wg-easy/.env`)

- `WG_HOST` — публичный IP или домен вашего VPS
- `PASSWORD_HASH` — bcrypt-хэш пароля для веб-интерфейса
- `WG_EASY_WEB_PORT` — порт на хосте для веб-интерфейса (по умолчанию `51821`)
- `WG_EASY_WG_PORT` — порт на хосте для UDP-трафика WireGuard (по умолчанию `51820`)

### HTTP Proxy (`http-proxy/.env`)

- `HTTP_PROXY_USER`, `HTTP_PROXY_PASSWORD` — учётные данные для прокси
- `HTTP_PROXY_PORT` — порт на хосте для HTTP-прокси (по умолчанию `3128`)
- `SOCKS_PROXY_PORT` — порт на хосте для SOCKS5-прокси (по умолчанию `1080`)

### Переменные скрипта установки

| Переменная       | По умолчанию     | Описание                              |
|------------------|------------------|---------------------------------------|
| `REPO_DIR`       | корень репозитория | Путь к git-репозиторию             |
| `DEPLOY_ROOT`    | `/opt/projects`  | Куда разворачиваются сервисы на VPS   |
| `DOCKER_NETWORK` | `projects-net`   | Имя общей Docker-сети                 |
| `SWAP_SIZE_GB`   | `2`              | Размер swap при установке на VPS      |
| `SKIP_SWAP=1`    | —                | Не создавать swap (используется в CI) |

---

## Структура проекта

```
infra-sandbox/
├── scripts/
│   ├── setup-vps.sh        # Первичная настройка VPS (Docker, каталоги, сеть)
│   ├── stack-up.sh         # Запуск полного стека для локальных тестов и CI
│   ├── stack-down.sh       # Остановка стека и удаление томов
│   ├── update-projects.sh  # git pull + синхронизация + перезапуск
│   └── generate-env-files.sh # Генерация случайных паролей для .env файлов
├── postgresql/             # Общий PostgreSQL 16
├── freshrss/               # FreshRSS
├── static-server/          # Nginx с тестовыми RSS-лентами
├── go-blog/                # Блог на Go (Gin, GORM, миграции Goose)
├── pgadmin/                # pgAdmin 4 с преднастроенным сервером PostgreSQL
├── portainer/              # Portainer CE для управления Docker
├── reverse-proxy/          # Caddy для localhost-поддоменов
├── s3-storage/             # MinIO S3-совместимое объектное хранилище
├── pg-backup/              # Автоматические бэкапы PostgreSQL в MinIO
├── wg-easy/                # WireGuard VPN-сервер с веб-интерфейсом
├── http-proxy/             # 3proxy HTTP и SOCKS5 прокси
├── tests/                  # End-to-end тесты Playwright
├── .github/workflows/ci.yml
├── package.json
└── playwright.config.ts
```

---

## Тесты

Тесты на [Playwright](https://playwright.dev/) работают против живого Docker-стека.

| Файл тестов          | Что проверяется                                          |
|----------------------|----------------------------------------------------------|
| `infra.spec.ts`      | Здоровье PostgreSQL, смоук-проверки сервисов, RSS        |
| `freshrss.spec.ts`   | Вход в FreshRSS, импорт ленты со static-server           |
| `go-blog.spec.ts`    | Вход в go-blog, посты, пагинация, фильтр по тегам        |
| `caddy.spec.ts`      | Маршруты reverse proxy для всех сервисов                 |
| `portainer.spec.ts`  | Вход в Portainer, API-авторизация, список контейнеров    |
| `pgadmin.spec.ts`    | Вход в pgAdmin, преднастроенный сервер, доступ к БД      |
| `s3-storage.spec.ts` | Доступность MinIO API и создание бакетов                 |
| `pg-backup.spec.ts`  | Выполнение скрипта бэкапа и проверка загрузки в MinIO    |
| `wg-easy.spec.ts`    | Вход в UI WireGuard и генерация конфигурации клиента     |
| `http-proxy.spec.ts` | Подключение к HTTP и SOCKS5 прокси, аутентификация       |

В CI стек поднимается до тестов (`SKIP_STACK_SETUP=1` говорит Playwright не запускать его повторно). Локально `global-setup.ts` автоматически вызывает `stack-up.sh`, если не задан `SKIP_STACK_SETUP=1`.

```bash
# Все тесты (стек запустится автоматически)
npm test

# Один файл тестов
npx playwright test tests/freshrss.spec.ts

# Интерактивный UI тестов
npm run test:ui
```

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) запускается при каждом push и pull request в `main`:

1. Устанавливает зависимости Node.js и Playwright
2. Запускает `setup-vps.sh` (с `SKIP_SWAP=1`)
3. Поднимает Docker-стек
4. Запускает тесты Playwright
5. При ошибке загружает HTML-отчёт
6. Останавливает стек

---

## Решение проблем

**«Docker network 'projects-net' not found»**

```bash
docker network create projects-net
```

**PostgreSQL не становится healthy**

Смотрите логи: `docker logs shared-postgres`. При первом запуске init-скрипты создают базы — подождите до 2 минут.

**Permission denied при работе с Docker (VPS)**

Перелогиньтесь после `setup-vps.sh` (добавление в группу `docker`) или выполните `newgrp docker`.

**Порт уже занят**

Переопределите порты при запуске:

```bash
FRESHRSS_HTTP_PORT=9081 STATIC_SERVER_HTTP_PORT=9082 GO_BLOG_HTTP_PORT=9083 \
PORTAINER_HTTP_PORT=9084 PGADMIN_HTTP_PORT=9085 npm run stack:up
```

---

## Лицензия

Это учебный / экспериментальный проект. Для продакшена проверьте лицензии отдельных сервисов (FreshRSS, Caddy, PostgreSQL и др.).
