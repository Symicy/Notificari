# 🔨 Sistem de Licitații Live

Aplicație web de licitații în timp real construită cu microservicii și Kubernetes.

## 📋 Tehnologii

- **Frontend:** React + Vite + Material-UI
- **Backend:** Node.js + Express
- **Bază de date:** MongoDB
- **Cache/Queue:** Redis + BullMQ
- **Real-time:** Socket.io
- **Autentificare:** JWT
- **Orchestrare:** Kubernetes (Minikube)
- **Containerizare:** Docker

## 🏗️ Arhitectură

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend  │────▶│  Auction Service │────▶│    MongoDB      │
│   (React)   │     │   (Express API)  │     │                 │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                    │
       │                    ▼
       │           ┌──────────────────┐
       │           │      Redis       │
       │           │  (Cache/Queue)   │
       │           └──────────────────┘
       │                    │
       ▼                    ▼
┌─────────────────────────────────────┐
│       Notification Service          │
│         (Socket.io)                 │
└─────────────────────────────────────┘
```

## 🚀 Prerequisite

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Minikube](https://minikube.sigs.k8s.io/docs/start/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Node.js 18+](https://nodejs.org/) (pentru development local)

## 📦 Instalare și Rulare

### 1. Pornește Minikube

```powershell
# Pornește cluster-ul Kubernetes
minikube start --driver=docker

# Activează Ingress controller
minikube addons enable ingress

# Pornește tunnel-ul pentru acces local (lasă deschis într-un terminal separat)
minikube tunnel
```

### 2. Configurează Docker pentru Minikube

```powershell
# Rulează în PowerShell pentru a folosi Docker-ul din Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression
```

> ⚠️ **Notă:** Această comandă trebuie rulată în fiecare terminal nou în care vrei să construiești imagini Docker.

### 3. Construiește imaginile Docker

```powershell
# Auction Service
cd auction-service
docker build -t auction-service:v1 .

# Frontend
cd ../frontend
docker build -t frontend:v1 .

# Notification Service
cd ../notification-service
docker build -t notification-service:v1 .
```

### 4. Deploy în Kubernetes

```powershell
cd ../k8s

# Deploy MongoDB și Redis
kubectl apply -f mongo.yaml
kubectl apply -f redis.yaml

# Așteaptă să pornească
kubectl wait --for=condition=ready pod -l app=mongo --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis --timeout=120s

# Deploy serviciile aplicației
kubectl apply -f app.yaml
kubectl apply -f ingress.yaml
```

### 5. Verifică starea

```powershell
# Vezi toate pod-urile
kubectl get pods

# Verifică Ingress
kubectl get ingress
```

### 6. Accesează aplicația

Deschide în browser: **http://localhost**

#### Credențiale Admin:
- **Username:** `admin`
- **Password:** `admin123`

---

## 🔄 Actualizare după modificări

### Modificări în Frontend

```powershell
# 1. Configurează Docker pentru Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# 2. Reconstruiește imaginea
cd frontend
docker build --no-cache -t frontend:v1 .

# 3. Restartează deployment-ul
kubectl rollout restart deployment frontend
```

### Modificări în Auction Service

```powershell
# 1. Configurează Docker pentru Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# 2. Reconstruiește imaginea
cd auction-service
docker build --no-cache -t auction-service:v1 .

# 3. Restartează deployment-ul
kubectl rollout restart deployment auction
```

### Modificări în Notification Service

```powershell
# 1. Configurează Docker pentru Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# 2. Reconstruiește imaginea
cd notification-service
docker build --no-cache -t notification-service:v1 .

# 3. Restartează deployment-ul
kubectl rollout restart deployment notification
```

### Script rapid pentru actualizare completă

```powershell
# Rulează din directorul principal al proiectului
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# Reconstruiește toate imaginile
docker build --no-cache -t auction-service:v1 ./auction-service
docker build --no-cache -t frontend:v1 ./frontend
docker build --no-cache -t notification-service:v1 ./notification-service

# Restartează toate deployment-urile
kubectl rollout restart deployment auction frontend notification
```

---

## 🛠️ Comenzi utile

### Vizualizare loguri

```powershell
# Loguri auction service
kubectl logs deployment/auction

# Loguri frontend
kubectl logs deployment/frontend

# Loguri în timp real
kubectl logs -f deployment/auction
```

### Debugging

```powershell
# Intră în container
kubectl exec -it deployment/auction -- sh

# Verifică variabilele de mediu
kubectl exec deployment/auction -- env

# Descrie un pod
kubectl describe pod -l app=auction
```

### Resetare completă

```powershell
# Șterge toate resursele
kubectl delete -f k8s/

# Repornește de la zero
kubectl apply -f k8s/mongo.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/app.yaml
kubectl apply -f k8s/ingress.yaml
```

### Oprire Minikube

```powershell
minikube stop
```

---

## 📁 Structură proiect

```
ProiectLicitatii/
├── auction-service/          # Backend API
│   ├── index.js              # Server principal
│   ├── models/               # Modele Mongoose
│   │   ├── Auction.js
│   │   └── User.js
│   ├── middleware/
│   │   └── auth.js           # Middleware JWT
│   └── Dockerfile
├── frontend/                 # React App
│   ├── src/
│   │   ├── App.jsx           # Componenta principală
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   └── pages/
│   │       └── LoginPage.jsx
│   └── Dockerfile
├── notification-service/     # WebSocket Server
│   ├── index.js
│   └── Dockerfile
├── k8s/                      # Kubernetes manifests
│   ├── app.yaml              # Deployments & Services
│   ├── ingress.yaml          # Ingress rules
│   ├── mongo.yaml
│   └── redis.yaml
└── README.md
```

---

## 🔐 Funcționalități

- ✅ Autentificare JWT (Login/Register)
- ✅ Rol Admin pentru gestionare licitații
- ✅ Creare/Ștergere licitații (admin only)
- ✅ Licitare în timp real
- ✅ Notificări live via WebSocket
- ✅ Timer pentru expirare licitații

---

## ❓ Troubleshooting

### Eroare: "connection refused" la http://localhost
```powershell
# Verifică că minikube tunnel rulează
minikube tunnel
```

### Pod-urile nu pornesc
```powershell
# Verifică statusul
kubectl get pods

# Vezi detalii eroare
kubectl describe pod <pod-name>

# Vezi loguri
kubectl logs <pod-name>
```

### Imaginile nu se actualizează
```powershell
# Asigură-te că ești în contextul Docker Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# Reconstruiește cu --no-cache
docker build --no-cache -t <image-name>:v1 .
```
