const express = require("express");
const cors = require("cors");
const app = express();
const path = require("path");

//middlewares
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//settings
app.set("port", process.env.PORT || 3001);

const server = app.listen(app.get("port"), () =>
  console.log(`Servidor escuchando en puerto ${app.get("port")}`)
);

const io = require("socket.io")(server);
io.set("transports", ["websocket"]);
const rooms = [];
createRoom();

app.get("/chat-coach", (_, res) =>
  res.sendFile(path.resolve(__dirname + "/example-client.html"))
);
app.get("/list-chats", (_, res) => res.json(rooms));

app.post("/createRoom", (req, res) => {
  const { idCoach, coach } = req.body;
  const hash = "124"; // make hash -- por definir

  if (rooms.some(coach => coach.idCoach == idCoach || coach.hash == hash)) {
    return res.status(500).json({ message: "Esta sala ya existe" });
  } else {
    rooms.push({ admin: idCoach, hash: hash, inChat: null });
    console.log("se agrego una nueva sala , listado de salas activas: ", rooms);
  }
  res.status(200).json({ message: "Sala creada" });
  console.log(`coach ${coach} creo una sala`);
});

function createRoom() {
  const chat = io.of(`/chat`).on("connection", socket => {
    console.log("un usuario Conectado");

    socket.on("joinRoom", request => {
      const {
        idCoach,
        coach,
        idPaciente,
        paciente,
        hash,
        soyPaciente
      } = request;

      console.log(
        `${
          soyPaciente ? `paciente: ${paciente}` : `coach: ${coach}`
        } pidio unirse a la sala`
      );

      var success = false;
      if (rooms.length) success = validationRoom(socket, request);

      if (!success) return;

      socket.join(hash);
      //   sessionHash = hash;
      console.log("un nuevo usuario a entrado al chat");

      soyPaciente
        ? chat.emit("welcome", {
            userName: idCoach,
            message: `Hola ${paciente} soy ${coach}, tu coach`
          })
        : chat.emit("coach", {
            userName: idPaciente,
            message: `En espera que Tu paciente, ${paciente} entre al chat`
          });

      socket.on("sendMessage", msg => {
        console.log(msg);
        try {
          chat.emit("message", msg);
        } catch (error) {
          socket.disconnect();
          console.log(error);
        }
      });

      function validationRoom(socket, request) {
        const { idCoach, paciente, soyPaciente, coach, hash } = request;
        const foundRoom = rooms.find(
          room => room.hash == hash && room.admin == idCoach
        );
        if (!foundRoom) {
          rejected(socket, "Credenciales incorrectas");
          return false;
        }

        if (foundRoom.inChat !== null) {
          if (foundRoom.inChat.length <= 2) {
            const registeredPatient = foundRoom.inChat.find(
              user => user.soyPaciente == true
            );
            const registeredMultiCoach = foundRoom.inChat.filter(
              user => user.soyPaciente == false
            );

            if (
              registeredPatient !== undefined &&
              registeredPatient.soyPaciente == soyPaciente
            ) {
              rejected(socket, "Ya existe un paciente registrado en esta sala");
              return false;
            } else if (registeredMultiCoach.length > 1) {
              //   rejected(socket, "Ya existe un coach registrado en esta sala");
              //   return false;
              return true;
            } else {
              foundRoom.inChat.push(request);
              chat.emit("chatInit", true);
              return true;
            }
          } else {
            rejected(
              socket,
              `Actualmente esta sala esta completa coach: ${coach} , atendiendo paciente: ${paciente}`
            );
            return false;
          }
        } else {
          foundRoom.inChat = [request];
          console.log(
            `se agrego ${
              request.soyPaciente ? request.paciente : request.coach
            } a la sala ${foundRoom.admin}`
          );
          return true;
        }
      }

      function rejected(socket, msg) {
        socket.emit("end", msg);
        console.log("usuario eliminado , razon :", msg);
        return socket.disconnect();
      }
    });

    socket.on("disconnect", () => {
      const hash = socket.handshake.headers["hash"];
      if(!!hash){
        chat.emit("deleteUser", "Usuario desconectado de la sala");
        console.log("usuario desconectado");
      }

      const soyPaciente = socket.handshake.headers["soypaciente"];
      const index = rooms.findIndex(r => r.hash == hash);

      if (index !== -1) {
        const roomFound = rooms[index];
        const positionPaciente = roomFound.inChat.findIndex(paciente => paciente.soyPaciente == true);
        var inChat = rooms[index]["inChat"];
        if (soyPaciente == 'true' && positionPaciente != -1) rooms[index]["inChat"] = inChat.filter(user => user.soyPaciente == false);
        if (rooms[index]["inChat"].length <= 1 && !soyPaciente) deleteRoom(index);
        console.log("rooms", rooms);
      }
    });

    socket.on("logout", request => {
      const { idCoach, hash } = request;
      console.log(` ${idCoach} termino chat`);
      chat.emit("deleteUser", "Usuario desconectado de la sala");
      socket.leaveAll();
      const index = rooms.findIndex(r => r.hash == hash);
      deleteRoom(index);
    });

    function deleteRoom(index) {
      const deleted = rooms.slice(index, 1);
      deleted.length
        ? console.log(`sala con admin : ${deleted[0].admin} ha sido eliminada`)
        : console.log(
            `Sala con hash : ${hash} no se encontro dentro de las salas registradas`
          );
    }
  });
}
