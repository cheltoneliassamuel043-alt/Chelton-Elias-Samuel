const socket = io("http://localhost:3000");

socket.emit("joinRoom", "room_1");

socket.on("receiveMessage", (message) => {
  console.log("Nova mensagem:", message);
});

function sendSocketMessage(room, text) {
  socket.emit("sendMessage", {
    room,
    text
  });
}