const socket = io();

const params = new URLSearchParams(window.location.search);

const orderId = params.get("order");
const role = params.get("role");

console.log("Order:", orderId);
console.log("Role:", role);

if (orderId && role) {
    socket.emit("join-order", {
        orderId: orderId,
        role: role
    });
}

const map = L.map("map").setView([23.0225, 72.5714], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "OpenStreetMap"
}).addTo(map);

let deliveryMarker = null;

if (role === "delivery") {

    navigator.geolocation.watchPosition(

        function(position) {

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            console.log(
                "Sending:",
                latitude,
                longitude
            );

            socket.emit("send-location", {
                latitude: latitude,
                longitude: longitude
            });

        },

        function(error) {

            console.log(
                "GPS error:",
                error.message
            );

        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        }
    );
}

if (role === "client") {

    socket.on("receive-location", function(data) {

        console.log("Received location:", data);

        const latitude = data.latitude;
        const longitude = data.longitude;

        if (!deliveryMarker) {

            deliveryMarker = L.marker([
                latitude,
                longitude
            ]).addTo(map);

        } else {

            deliveryMarker.setLatLng([
                latitude,
                longitude
            ]);

        }

        map.setView([
            latitude,
            longitude
        ], 16);

    });
}

socket.on("user-disconnected", (id) => {
    console.log("User disconnected:", id);
});
