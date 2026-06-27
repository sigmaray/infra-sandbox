# infra-sandbox

Песочница инфраструктуры на Docker: небольшой набор сервисов для VPS или локальной разработки. В стек входят общая база PostgreSQL, CMS Drupal, RSS-читалка FreshRSS, статический сервер с тестовыми лентами и блог на Go.

**[English version →](README.md)**

---

## Что это?

Репозиторий решает две задачи:

1. **Готовый к развёртыванию стек** — набор Docker Compose-проектов для установки на VPS DigitalOcean (рекомендуется 4 ГБ RAM).
2. **Набор интеграционных тестов** — end-to-end проверки на Playwright, что все сервисы работают вместе.

Все сервисы используют один экземпляр PostgreSQL и общую Docker-сеть `projects-net`.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker-сеть: projects-net                     │
│                                                                   │
│  ┌──────────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐ │
│  │ shared-      │   │ Drupal  │   │ FreshRSS │   │ go-blog  │ │
│  │ postgres     │◄──│ :8080   │   │ :8081    │   │ :8083    │ │
│  │              │◄──┤         │   │          │   │          │ │
│  │ БД drupal    │◄──┤         │   │          │   │          │ │
│  │ БД freshrss  │   └─────────┘   └────┬─────┘   └──────────┘ │
│  │ БД goblog    │                      │                         │
│  └──────────────┘                      │ подписка на             │
│         ▲                              ▼                         │
│         │                      ┌──────────────┐                   │
│         │                      │ static-server│                   │
│         │                      │ (nginx)      │                   │
│         │                      │ :8082        │                   │
│         └──────────────────────┴──────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Сервисы и порты по умолчанию

| Сервис         | Имя контейнера   | Порт | Описание                                         |
|----------------|------------------|------|--------------------------------------------------|
| PostgreSQL     | `shared-postgres`| —    | Общая БД для Drupal, FreshRSS и go-blog          |
| Drupal         | `drupal`         | 8080 | Drupal 10 с автоматической установкой            |
| FreshRSS       | `freshrss`       | 8081 | Самостоятельно размещаемая RSS-читалка           |
| Статический сервер | `static-server` | 8082 | Nginx с тестовыми RSS-лентами                |
| Go Blog        | `go-blog`        | 8083 | Простой блог на Go (Gin + GORM)                  |

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

| Сервис    | URL                          | Логин по умолчанию       |
|-----------|------------------------------|--------------------------|
| Drupal    | http://127.0.0.1:8080        | `admin` / `test-admin`   |
| FreshRSS  | http://127.0.0.1:8081        | `admin` / `test-admin`   |
| Go Blog   | http://127.0.0.1:8083        | `admin` / `admin`        |
| RSS-ленты | http://127.0.0.1:8082/feeds/ | — (без авторизации)    |

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
cd /opt/projects/drupal     && docker compose up -d
cd /opt/projects/freshrss   && docker compose up -d
cd /opt/projects/static-server && docker compose up -d
cd /opt/projects/go-blog    && docker compose up -d
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
| `PROJECTS="drupal go-blog"` | Обновить только выбранные проекты     |

---

## Конфигурация

У каждого сервиса своя папка с `docker-compose.yml` и `.env.example`. Скопируйте `.env.example` в `.env` и измените значения.

### PostgreSQL (`postgresql/.env`)

При первом запуске создаёт три базы: `drupal`, `freshrss`, `goblog`. У каждой — отдельный пользователь.

### Drupal (`drupal/.env`)

- Название сайта, учётные данные администратора, подключение к БД
- `DRUPAL_HTTP_PORT` — порт на хосте (по умолчанию `8080`)
- Drupal устанавливается автоматически при первом запуске контейнера через Drush

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
│   └── update-projects.sh  # git pull + синхронизация + перезапуск
├── postgresql/             # Общий PostgreSQL 16
├── drupal/                 # Drupal 10 + Apache, автоустановка
├── freshrss/               # FreshRSS
├── static-server/          # Nginx с тестовыми RSS-лентами
├── go-blog/                # Блог на Go (Gin, GORM, миграции Goose)
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
| `infra.spec.ts`      | Здоровье PostgreSQL, главная Drupal, RSS на static-server |
| `freshrss.spec.ts`   | Вход в FreshRSS, импорт ленты со static-server           |
| `drupal-blog.spec.ts`| Настройка блога Drupal, посты, пагинация, теги           |
| `go-blog.spec.ts`    | Вход в go-blog, посты, пагинация, фильтр по тегам        |

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

**Drupal ещё устанавливается**

Первый запуск выполняет `drush site:install`. Прогресс: `docker logs -f drupal`.

**Permission denied при работе с Docker (VPS)**

Перелогиньтесь после `setup-vps.sh` (добавление в группу `docker`) или выполните `newgrp docker`.

**Порт уже занят**

Переопределите порты при запуске:

```bash
DRUPAL_HTTP_PORT=9080 FRESHRSS_HTTP_PORT=9081 npm run stack:up
```

---

## Лицензия

Это учебный / экспериментальный проект. Для продакшена проверьте лицензии отдельных сервисов (Drupal, FreshRSS и др.).
