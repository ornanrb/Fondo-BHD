# Mi Fondo BHD – Control de Inversión

Aplicación web **personal y privada** para llevar el control diario de un fondo de inversión: escribes el balance acumulado que ves en tu cuenta y la app calcula la ganancia del día, del mes y acumulada.

- 100 % HTML + CSS + JavaScript, sin servidor, sin cuentas, sin costos.
- Los datos se guardan **solo en tu dispositivo** (IndexedDB). No se envía nada a internet ni se conecta al banco.
- Funciona en computadora, tableta y iPhone/Android. Se puede instalar como app y usar sin conexión.

## Contenido

```
index.html            Página principal
css/styles.css        Estilos (claro y oscuro, responsive)
js/calc.js            Motor de cálculo (centavos enteros, sin errores de decimales)
js/db.js              Almacenamiento persistente (IndexedDB)
js/demo.js            Datos ficticios de demostración
js/charts.js          Gráficos (Chart.js)
js/app.js             Interfaz
lib/                  Chart.js y SheetJS (incluidos, no requieren internet)
icons/, manifest.webmanifest, sw.js   Instalación como app y modo sin conexión
tests/calc.test.js    Pruebas del motor de cálculo
```

## Uso rápido

1. **Abrir:** publícala en GitHub Pages (abajo) o, en tu computadora, ejecuta `python3 -m http.server` dentro de la carpeta y abre `http://localhost:8000`. (No la abras con doble clic en `index.html`: algunos navegadores bloquean el almacenamiento en archivos locales.)
2. **Borrar la demostración:** en el Panel pulsa **Borrar datos de demostración**.
3. **Ajustes → Configuración de mi inversión:** escribe el nombre, la **fecha de inicio** y el **capital inicial**.
4. **Registrar → Balance diario:** elige la fecha, escribe el balance acumulado de tu cuenta BHD y verás al instante la **GANANCIA DEL DÍA**. Pulsa *Guardar*.
5. Si agregas o retiras dinero: **Registrar → Depósito / Retiro**. Esos movimientos no cuentan como ganancia ni como pérdida.
6. Consulta el **Panel**, el **Historial y resumen mensual** (elige mes y año) y los **Gráficos**.

Puedes omitir fines de semana y feriados: cada ganancia se calcula contra el **último balance registrado cronológicamente**, nunca se inventan balances.

## Reglas de cálculo

- **Ganancia diaria** = Balance actual − Balance anterior − Depósitos + Retiros ocurridos entre ambos registros.
- El primer registro se compara con el **capital inicial**.
- **Rendimiento diario** = Ganancia ÷ balance anterior.
- Un depósito o retiro con la **misma fecha** que un registro se considera ya incluido en el balance de ese día (así lo muestra el banco). Si lo fechas en un día sin registro, se aplica al siguiente registro.
- **Ganancia del mes** = suma de las ganancias diarias del mes. **Ganancia acumulada** = suma de todas (nunca se duplica).
- **Rentabilidad mensual** = ganancia del mes ÷ (balance inicial del mes + aportes netos del mes).
- **Rentabilidad acumulada** = ganancia acumulada ÷ capital aportado (capital inicial + depósitos).
- Todo se calcula a partir de los registros: **si editas o eliminas uno, todo lo posterior se recalcula**.
- Cambiar el capital inicial solo afecta la base del primer registro (la app te lo advierte y guarda un historial del cambio). Para dinero agregado después, usa Depósito.

## Historial, exportar y respaldo

- **Historial:** busca por fecha, filtra por mes/año, ve el detalle del cálculo, edita o elimina (con confirmación).
- **CSV** (vista filtrada), **Excel** (registros, resumen mensual y movimientos) e **Informe PDF**: el botón abre la vista de impresión; elige *Guardar como PDF* (en iPhone: Compartir → Guardar en Archivos).
- **Ajustes → Exportar respaldo** descarga un `.json` con toda tu información; **Importar respaldo** la restaura. Haz una copia de vez en cuando (y antes de borrar datos del navegador o cambiar de teléfono).

## Publicar gratis en GitHub Pages

1. Crea una cuenta en <https://github.com> y un repositorio nuevo (por ejemplo `mi-fondo-bhd`).
2. Sube **todo el contenido de esta carpeta** (*Add file → Upload files*), manteniendo las subcarpetas, y confirma con *Commit changes*.
3. Ve a **Settings → Pages**. En *Build and deployment* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Guarda.
4. En 1–2 minutos tu app estará en `https://TU-USUARIO.github.io/mi-fondo-bhd/`.

> **Privacidad:** el sitio es público, pero **tus datos no**: viven únicamente en el navegador de cada dispositivo. Nadie que abra el enlace verá tus balances. Si prefieres que el código tampoco sea público, usa un repositorio privado (GitHub Pages en repos privados requiere un plan de pago); alternativamente, ejecútala solo de forma local.

### Instalar en iPhone

Abre el enlace en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.

> Los datos son por dispositivo y por navegador: lo que registres en el iPhone no aparece en la computadora. Usa Exportar/Importar respaldo para pasarlos de uno a otro. Safari puede borrar datos de sitios que no usas en semanas si no está instalada como app; por eso conviene instalarla y respaldar.

## Pruebas

```
node tests/calc.test.js
```
Verifican ganancias diarias, días omitidos, edición/eliminación, depósitos y retiros, resúmenes mensuales y validaciones (22 pruebas).

## Mantenimiento

- Para actualizar la app, reemplaza los archivos en GitHub; tus datos en cada dispositivo no se tocan.
- Si cambias archivos y no ves el cambio, recarga forzando (Ctrl/Cmd+Shift+R) o actualiza `CACHE` en `sw.js`.
