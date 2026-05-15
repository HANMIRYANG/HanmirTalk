# 08. Backend API 명세

Base URL 예시: `/api/v1`

## Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`

## Users

- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `PATCH /users/:id/deactivate`

## Departments

- `GET /departments`
- `POST /departments`
- `PATCH /departments/:id`
- `DELETE /departments/:id`

## Rooms

- `GET /rooms`
- `POST /rooms`
- `GET /rooms/:id`
- `PATCH /rooms/:id`
- `POST /rooms/:id/members`
- `DELETE /rooms/:id/members/:userId`

## Messages

- `GET /rooms/:roomId/messages`
- `POST /rooms/:roomId/messages`
- `DELETE /messages/:id`
- `POST /messages/:id/read`
- `POST /messages/:id/pin`
- `DELETE /messages/:id/pin`
- `GET /messages/search?q=`

## Files

- `POST /files/upload`
- `GET /files`
- `GET /files/:id`
- `DELETE /files/:id`

## Notices

- `GET /notices`
- `POST /notices`
- `GET /notices/:id`
- `POST /notices/:id/confirm`
- `GET /notices/:id/read-status`

## Projects

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`
- `POST /projects/:id/members`
- `DELETE /projects/:id/members/:userId`
- `GET /projects/:id/summary`

## Tasks

- `GET /projects/:projectId/tasks`
- `POST /projects/:projectId/tasks`
- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`
- `POST /messages/:messageId/create-task`

## Products

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `DELETE /products/:id`
- `POST /products/:id/documents`
- `GET /products/:id/documents`

## Decisions

- `GET /projects/:projectId/decisions`
- `POST /projects/:projectId/decisions`
- `GET /decisions/:id`
- `PATCH /decisions/:id`
- `DELETE /decisions/:id`
- `POST /messages/:messageId/create-decision`

## Dashboard

- `GET /dashboard/overview`
- `GET /dashboard/projects`
- `GET /dashboard/tasks-due-soon`
- `GET /dashboard/sales-status`

## WebSocket Events

Client to Server:

- `message:send`
- `message:read`
- `room:join`
- `room:leave`
- `typing:start`
- `typing:stop`

Server to Client:

- `message:new`
- `message:updated`
- `message:deleted`
- `notice:new`
- `task:assigned`
- `project:updated`
- `notification:new`
