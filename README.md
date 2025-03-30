<p align='center'>
    <img 
        src="https://capsule-render.vercel.app/api?type=waving&height=200&color=390f16&text=Lucha%20o%20Muere&fontAlignY=37&fontColor=ffff&desc=Trabajo%20Semestre%20-%20Ingenieria%20Web&descSize=15&descAlignY=55"
    />
</p>
<p align='center'>
  <a href="https://voluble-marzipan-d9b11b.netlify.app/home">
    <img 
        src="https://media.discordapp.net/attachments/1309955522690023515/1355708055861465108/image.png?ex=67e9e904&is=67e89784&hm=ac4c6b96e5ee297e7db025287f5812ba9086609b5587fedb1c5ca481fd6d0323&=&format=webp&quality=lossless&width=2042&height=1186" width="465" height="285" alt="Documentacion de Postman"
    />
  </a>
</p>
    <p align='center'>
        <img
        src="https://readme-typing-svg.demolab.com/?font=Iosevka&size=16&pause=1000&color=FFFFFF&center=true&vCenter=true&width=435&lines=Dale+click+a+la+imagen+para+ver+la+documentacion+de+Postman!" alt="Typing SVG"
        />
        <img 
        src="https://capsule-render.vercel.app/api?type=rect&height=10&color=390f16&fontAlignY=37&fontColor=ffff&descSize=15&descAlignY=55"
        >
    </p>

## 👾 Descripcion

Este sistema permite la gestión de combates de entre los participantes en un mundo ficticio donde:
- Un unico administrador supervisa las batallas, aprueba/rechaza batallas y desbloquea cuentas 
- Dictadores entrenan y gestionan participantes para competir en batallas. Pueden apostar en batallas que no sean propias y otorgar otorgar buffs a participantes propios.
- Sponsors proveen armas, mejoras y comercian en el mercado negro. Otorgan buffs a participantes de los combates.


## 💻️ Caracteristicas
- Registro y gestión de usuarios con roles de: Admin, Dictador y Sponsor.
- Creación y personalización de los concursantes.
- Mercado negro para compra y venta de ítems  (armas/buffs)
- Sistema de apuestas en combates.
- Autenticación basada en tokens JWT
- Roles y permisos por usuario

## ⚔️ Uso del sistema
### Rutas de Autenticacion
- **Registro Admin Inicial:** `POST /auth/register`
- **Login:** `POST /auth/login`
- **Activación de cuenta:** `POST /auth/active`
### Rutas del Admin
- **Resgistrar Dictador:** `POST /admin/register-dictator`
- **Resgistrar Sponsor:** `POST /admin/register-sponsor`
- **Listar Usuarios:** `GET /admin/users`
- **Eliminar Usuario:** `DELETE /admin/users/:id`
- **Desbloquear Usuario:** `POST /admin/unlock-user`
- **Obtener Batallas Pendientes:** `GET /admin/get-Pending-Battles`
- **Aprobar Batalla:** `POST /admin/Aprove-Battles`
- **Iniciar Batalla:** `POST /admin/start/:battleId`
- **Listar Eventos Activos:** `GET /admin/active`
- **Cerrar Batalla:** `POST /admin/:battleId`
### Rutas de los Dictadores
- **Listar Contestants:** `GET /dictator/contestants`
- **Crear Constestans:** `POST /dictator/add-contestans`
- **Ver Black Market:** `GET /dictator/blackmarket/Activity`
- **Comprar Item:** `POST /dictator/blackmarket/buy-item`
- **Dar Item a Contestant:** `POST /dictator/give-item`
- **Activar Contestant:** `PUT /dictator/contestants/:contestantId`
- **Liberar Contestant:** `DELETE /dictator/release-contestants/:contestantId`
- **Obtener Oponentes:** `GET /dictator/available-opponents`
- **Proponer Batalla:** `POST /dictator/propose-battle`
- **Hacer Apuesta:** `POST /dictator/place-bet`
- **Aplicar Buff:** `POST /dictator/apply-buff`
- **Aplicar Buff en Batalla:** `POST /dictator/apply-buff/battle`
### Rutas de los Sponsors
- **Listar todos Contestants:** `GET /sponsor/contestants`
- **Dar Item a Contestant:** `POST /sponsor/give-item`
- **Ver inventario:** `GET /sponsor/inventory`
- **Ofrecer Item en Black Market:** `POST /sponsor/blackmarket/offer-item`
- **Añadir Item a Inventario:** `POST /sponsor/add-item`
- **Ver Publicaciones Propias:** `GET /sponsor/blackmarket/listings`
- **Eliminar Publicación:** `DELETE /sponsor/blackmarket/remove-listing`
- **Listar Batallas Activas:** `GET /sponsor/battles/active`
- **Hacer Apuesta:** `POST /sponsor/place-bet`
- **Aplicar Buff:** `POST /sponsor/apply-buff`
- **Aplicar Buff en Batalla:** `POST /sponsor/apply-buff/battle`
