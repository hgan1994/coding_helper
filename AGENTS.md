# AGENTS.md

## Build & Run Commands
- Dev: `npm run dev`
- Build: `npm run build`
- TypeCheck: `npm run typecheck`

## Project Structure
- `src/main/` - Electron main process
- `src/preload/` - Preload scripts (IPC bridge)
- `src/renderer/` - React frontend
- `src/main/database.ts` - SQLite database layer
- `src/main/ipc/providers.ts` - IPC handlers for provider CRUD
- `src/renderer/src/components/` - React UI components
