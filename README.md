# 🤖 Moni — Asistente de Finanzas Personales con IA

Moni es un dashboard inteligente de finanzas personales diseñado como una Single Page Application (SPA) moderna, desacoplada y construida con estándares profesionales. El sistema permite gestionar cuentas de débito, deudas en tarjetas de crédito, presupuestos mensuales, recordatorios de pago de servicios con auto-renovación y cobros de trabajos freelance.

Además, cuenta con un **asistente conversacional inteligente híbrido** integrado con la API de Google Gemini (y Kimi IA) que permite registrar movimientos y consultar deudas utilizando lenguaje natural, con un motor NLP de retroceso (fallback) local de latencia cero.

---

## 🚀 Características Clave (Portafolio Profesional)

*   **Arquitectura Modular ES6:** Código estructurado en módulos nativos de JavaScript (`import`/`export`), sin depender de herramientas de empaquetado complejas (como Webpack o Vite), lo que garantiza una carga rápida y compatible directamente con los navegadores.
*   **Pruebas Unitarias Nativas:** Suite de pruebas automatizadas escrita con el **test runner nativo de Node.js** (`node:test` y `node:assert`), garantizando la estabilidad matemática del motor contable (date rollover, redondeos y balances consolidados).
*   **Persistencia Híbrida Inteligente:** Conmutación automática a LocalStorage si el servidor backend no está disponible o si la aplicación se aloja en servicios estáticos como Netlify/Vercel.
*   **Reportes Ejecutivos Dinámicos:** Módulo de reportabilidad mensual en tiempo real que calcula tasas de ahorro, gastos fijos vs. variables, desglosa categorías y permite exportación física mediante impresión adaptada a PDF.
*   **Privacidad Blindada:** Configuración estricta de `.gitignore` que previene la sincronización accidental de datos financieros reales (`datos.json`) y estados de cuenta en repositorios públicos.
*   **Diseño Premium Estético:** Interfaz con diseño de cuadrícula responsive, paletas de colores HSL armonizadas, efectos de vidrio difuminado (glassmorphism) y micro-animaciones para mejorar la interacción.

---

## 🛠️ Tecnologías Utilizadas

*   **Frontend:** HTML5 (Semántico), CSS3 (Variables nativas, Grid, Flexbox), Javascript ES6 (Modules).
*   **Visualización:** Chart.js (Gráficos interactivos de flujo y dona), Lucide Icons (Iconografía vectorial dinámica).
*   **Backend:** Node.js, Express.js (Servidor API local y Proxy seguro para peticiones de IA).
*   **Testing:** Node.js Native Test Runner (`node --test`).
*   **IA:** API de Google Gemini (Llamadas seguras vía headers en frontend/backend) y Kimi/Moonshot.

---

## 📂 Estructura de Archivos del Proyecto

```
Finanzas-AI/
├── package.json            # Configuración de Node y scripts (type: module)
├── server.js               # Servidor local Express y Proxy seguro de IA
├── netlify.toml            # Configuración para despliegue automático en Netlify
├── tests/
│   └── calculations.test.js # Suite de pruebas contables automatizadas
└── public/                 # Carpeta estática servida por el backend
    ├── index.html          # Estructura principal de la SPA
    ├── styles.css          # Estilos vanilla premium y glassmorphism
    └── js/                 # Módulos de Javascript ES6
        ├── main.js         # Punto de entrada y orquestador reactivo
        ├── state.js        # Gestión del estado global y LocalStorage
        ├── calculations.js # Motor contable y cálculos puramente funcionales
        ├── ai/
        │   ├── client.js   # NLP local, autocompletado y cliente API
        │   └── prompt.js   # Generador del system prompt de Gemini
        └── ui/
            ├── dashboard.js# Renderizado de widgets y métricas principales
            ├── history.js  # Tabla de transacciones, ordenamiento y CSV
            ├── reports.js  # Generador ejecutivo mensual e impresión
            ├── settings.js # Ajustes generales y CRUD de categorías
            └── components.js# Toasts, sanitización XSS e iconografía
```

---

## 🏁 Instrucciones de Instalación y Ejecución

### 1. Requisitos Previos
Asegúrate de tener instalado [Node.js](https://nodejs.org) (Versión 18 o superior recomendada).

### 2. Clonar y Configurar
Clona este repositorio en tu máquina local y accede a la carpeta:
```bash
git clone https://github.com/janodll/Moni-Finanzas.git
cd Moni-Finanzas
```

### 3. Instalar Dependencias
Instala los paquetes ligeros necesarios (Express y CORS) para levantar el backend local:
```bash
npm install
```

### 4. Ejecutar el Servidor Local
Inicia el servidor local de desarrollo:
```bash
npm start
```
Abre en tu navegador [http://localhost:3001](http://localhost:3001) para ver la aplicación web en marcha con persistencia física en el archivo `datos.json`.

---

## 🧪 Ejecución de Pruebas Unitarias

Para validar el motor contable y asegurar que no hay regresiones matemáticas en los cálculos de balances ni renovaciones de fechas, ejecuta la suite de pruebas nativas:
```bash
npm test
```
Esto correrá las pruebas en la consola mostrando un reporte detallado del estado de ejecución (tiempos de ejecución típicos de ~40ms).

---

## ☁️ Despliegue en Producción

### Despliegue Estático (Netlify / Vercel)
Este proyecto está preparado para correr de forma estática sin un servidor backend activo.
*   **Netlify:** Vincula el repositorio a Netlify. El archivo `netlify.toml` redirigirá la publicación a la carpeta `public/` automáticamente de forma gratuita.
*   **Vercel:** Vincula tu repositorio y establece el directorio de salida (Output Directory) como `public`.
*   *Nota:* En modo estático la aplicación operará en **Modo LocalStorage** y la clave API de Gemini se guardará únicamente en el navegador del usuario para consultas de IA directas y seguras.
