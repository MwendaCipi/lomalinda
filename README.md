# Loma Linda Church Project

This repository contains both the Next.js frontend application and the Django REST framework backend.

## Project Structure

```
lomalinda/
├── frontend/    # Next.js 16 (React 19, TypeScript, Tailwind CSS)
└── backend/     # Django REST Framework backend with Python
```

---

## 🚀 Running the Frontend

Navigate to the `frontend` folder and start the development server:

```bash
cd frontend
npm run dev
```

The frontend will be available at **[http://localhost:3000](http://localhost:3000)**.

---

## 🐍 Running the Backend

Navigate to the `backend` folder, activate the virtual environment, and start the Django server:

### On Windows (PowerShell):
```powershell
cd backend
.\venv\Scripts\activate
python manage.py runserver 8000
```

### On macOS / Linux:
```bash
cd backend
source venv/bin/activate
python manage.py runserver 8000
```

The API will be available at **[http://localhost:8000](http://localhost:8000)**.
