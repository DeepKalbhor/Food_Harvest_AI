require("dotenv").config();

const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const mysql = require("mysql2/promise");

// SERVER SETUP
const server = http.createServer(app);
const io = socketio(server);

// MIDDLEWARE
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// MYSQL CONNECTION
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        ca: fs.readFileSync(path.join(__dirname, "ca.pem"))
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// TEST DATABASE CONNECTION
async function testDatabase() {
    try {
        const [rows] = await db.query(
            "SELECT COUNT(*) AS total FROM Orders"
        );

        console.log("MySQL connected");
        console.log("Total orders:", rows[0].total);
    } catch (error) {
        console.error("MySQL connection failed:", error.message);
    }
}

testDatabase();

// SOCKET.IO REAL-TIME TRACKING
io.on("connection", function(socket) {
    console.log("User connected:", socket.id);

    socket.on("join-order", function(data) {
        const { orderId, role } = data;

        if (!orderId || !role) {
            return;
        }

        socket.join(String(orderId));
        socket.orderId = String(orderId);
        socket.role = role;

        console.log(`${role} joined order ${orderId}`);
    });

    socket.on("send-location", function(data) {
        if (!socket.orderId || socket.role !== "delivery") {
            return;
        }

        console.log(
            "Location received:",
            data.latitude,
            data.longitude
        );

        io.to(socket.orderId).emit("receive-location", {
            latitude: data.latitude,
            longitude: data.longitude
        });
    });

    socket.on("disconnect", function() {
        console.log("User disconnected:", socket.id);
    });
});

// PAGE ROUTES
app.get("/", function(req, res) {
    res.render("index");
});

app.get("/donate", function(req, res) {
    res.render("donate");
});

app.get("/matching", function(req, res) {
    res.render("matching");
});

app.get("/delivery/:orderId", function(req, res) {
    res.render("delivery", {
        orderId: req.params.orderId
    });
});

app.get("/track/:orderId", function(req, res) {
    res.render("track", {
        orderId: req.params.orderId
    });
});

// SAVE FOOD DONATION
app.post("/api/donations", async function(req, res) {
    try {
        const {
            food_name,
            category,
            quantity,
            unit,
            pickup_address
        } = req.body;

        if (
            !food_name ||
            !category ||
            !unit ||
            !pickup_address ||
            !Number.isFinite(Number(quantity)) ||
            Number(quantity) <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: "Please provide valid donation details."
            });
        }

        // Prototype uses the existing restaurant record.
        const restaurantId = 1;

        const [restaurants] = await db.query(
            "SELECT latitude, longitude FROM Restaurants WHERE restaurant_id = ?",
            [restaurantId]
        );

        if (restaurants.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Restaurant record not found."
            });
        }

        const preparedTime = new Date();
        const expiryTime = new Date(
            preparedTime.getTime() + 24 * 60 * 60 * 1000
        );

        function formatMySQLDate(date) {
            return date.toISOString().slice(0, 19).replace("T", " ");
        }

        const [result] = await db.query(
            `INSERT INTO FoodDonations (
                restaurant_id,
                food_name,
                category,
                quantity,
                unit,
                prepared_time,
                expiry_time,
                pickup_address,
                latitude,
                longitude,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
            [
                restaurantId,
                food_name.trim(),
                category.trim(),
                Number(quantity),
                unit.trim(),
                formatMySQLDate(preparedTime),
                formatMySQLDate(expiryTime),
                pickup_address.trim(),
                restaurants[0].latitude,
                restaurants[0].longitude
            ]
        );

        console.log("Donation saved. Food ID:", result.insertId);

        return res.status(201).json({
            success: true,
            message: "Food donation saved successfully.",
            foodId: result.insertId
        });
    } catch (error) {
        console.error("Donation save error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to save donation. Please try again."
        });
    }
});

// FIND MULTIPLE NGO MATCHES FOR A DONATION
app.get("/api/matching-ngo", async function(req, res) {
    try {
        const foodId = Number(req.query.foodId);

        if (!Number.isInteger(foodId) || foodId <= 0) {
            return res.status(400).json({
                success: false,
                error: "A valid foodId is required."
            });
        }

        const [foods] = await db.query(
            `SELECT food_id, food_name, quantity, unit, latitude, longitude
             FROM FoodDonations
             WHERE food_id = ? AND status = 'Available'`,
            [foodId]
        );

        if (foods.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Donation not found or no longer available."
            });
        }

        const food = foods[0];

        // Find up to 10 verified NGOs, nearest first.
        const [ngos] = await db.query(
            `SELECT
                ngo_id,
                ngo_name,
                address,
                capacity,
                latitude,
                longitude,
                (
                    6371 * ACOS(
                        LEAST(1, GREATEST(-1,
                            COS(RADIANS(?)) *
                            COS(RADIANS(latitude)) *
                            COS(RADIANS(longitude) - RADIANS(?)) +
                            SIN(RADIANS(?)) *
                            SIN(RADIANS(latitude))
                        ))
                    )
                ) AS distance_km
             FROM NGOs
             WHERE verification_status = 'Verified'
               AND capacity > 0
               AND latitude IS NOT NULL
               AND longitude IS NOT NULL
             ORDER BY distance_km ASC
             LIMIT 10`,
            [food.latitude, food.longitude, food.latitude]
        );

        return res.json({
            success: true,
            food: {
                food_id: food.food_id,
                food_name: food.food_name,
                quantity: food.quantity,
                unit: food.unit
            },
            ngos: ngos.map(function(ngo) {
                return {
                    ngo_id: ngo.ngo_id,
                    ngo_name: ngo.ngo_name,
                    address: ngo.address,
                    capacity: ngo.capacity,
                    distance_km: Number(ngo.distance_km)
                };
            })
        });
    } catch (error) {
        console.error("NGO matching error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to find matching NGOs."
        });
    }
});

// GET EXISTING ORDER DETAILS
app.get("/api/orders/:orderId", async function(req, res) {
    try {
        const orderId = req.params.orderId;

        console.log("Searching for order:", orderId);

        const [rows] = await db.query(
            `SELECT
                o.order_id,
                o.order_status,
                f.food_name,
                f.quantity,
                f.unit,
                r.restaurant_name,
                n.ngo_name,
                dp.driver_id,
                dp.vehicle_number
             FROM Orders o
             JOIN FoodRequests fr
                ON o.request_id = fr.request_id
             JOIN FoodDonations f
                ON fr.food_id = f.food_id
             JOIN Restaurants r
                ON o.restaurant_id = r.restaurant_id
             JOIN NGOs n
                ON o.ngo_id = n.ngo_id
             LEFT JOIN DeliveryPartners dp
                ON o.driver_id = dp.driver_id
             WHERE o.order_id = ?`,
            [orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        return res.json({
            success: true,
            order: rows[0]
        });
    } catch (error) {
        console.error("Database error:", error);

        return res.status(500).json({
            success: false,
            message: "Database error"
        });
    }
}); 

// EXISTING ORDER-BASED MATCHING ENDPOINT
// This endpoint uses existing FoodRequests and Orders.
// It does not create a new order.
app.post("/api/matching", async function(req, res) {
    try {
        const { foodId } = req.body;

        if (!foodId) {
            return res.status(400).json({
                success: false,
                message: "foodId is required"
            });
        }

        console.log("Running matching for food:", foodId);

        const [rows] = await db.query(
            `SELECT
                n.ngo_id,
                n.ngo_name,
                o.order_id,
                (
                    LEAST(f.quantity / n.capacity, 1) * 40
                    +
                    (
                        1 / (
                            1 +
                            (
                                6371 * ACOS(
                                    COS(RADIANS(f.latitude)) *
                                    COS(RADIANS(n.latitude)) *
                                    COS(
                                        RADIANS(n.longitude) -
                                        RADIANS(f.longitude)
                                    ) +
                                    SIN(RADIANS(f.latitude)) *
                                    SIN(RADIANS(n.latitude))
                                )
                            )
                        )
                    ) * 60
                ) AS MatchingScore
             FROM FoodDonations f
             JOIN NGOs n ON n.capacity > 0
             JOIN FoodRequests fr
                ON fr.food_id = f.food_id
                AND fr.ngo_id = n.ngo_id
             JOIN Orders o
                ON o.request_id = fr.request_id
                AND o.ngo_id = n.ngo_id
             WHERE f.food_id = ?
               AND f.status = 'Available'
               AND n.verification_status = 'Verified'
               AND fr.status = 'Pending'
             ORDER BY MatchingScore DESC
             LIMIT 1`,
            [foodId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No matching order found"
            });
        }

        const matchedOrder = rows[0];
        const orderId = matchedOrder.order_id;
        const baseUrl = `${req.protocol}://${req.get("host")}`;

        return res.json({
            success: true,
            ngoId: matchedOrder.ngo_id,
            ngoName: matchedOrder.ngo_name,
            orderId: orderId,
            matchingScore: matchedOrder.MatchingScore,
            deliveryUrl: `${baseUrl}/delivery/${orderId}`,
            trackingUrl: `${baseUrl}/track/${orderId}`
        });
    } catch (error) {
        console.error("Matching error:", error);

        return res.status(500).json({
            success: false,
            message: "Matching failed"
        });
    }
});

// DATABASE TEST ROUTE
app.get("/test-matching", async function(req, res) {
    try {
        const [rows] = await db.query("SELECT 1 AS test");

        res.send(`
            <h2>Database connection works!</h2>
            <p>Test result: ${rows[0].test}</p>
        `);
    } catch (error) {
        console.error("DATABASE TEST ERROR:", error);

        res.status(500).send(`
            <h2>Database connection failed</h2>
            <p>Code: ${error.code || "none"}</p>
            <p>Message: ${error.message || "none"}</p>
            <pre>${error.stack || ""}</pre>
        `);
    }
});

app.post("/api/create-order", async function(req, res) {
    let connection;

    try {
        const foodId = Number(req.body.foodId);
        const ngoId = Number(req.body.ngoId);

        if (
            !Number.isInteger(foodId) || foodId <= 0 ||
            !Number.isInteger(ngoId) || ngoId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Valid foodId and ngoId are required."
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Lock the donation so it cannot be ordered twice concurrently.
        const [foods] = await connection.query(
            `SELECT food_id, restaurant_id, status
             FROM FoodDonations
             WHERE food_id = ?
             FOR UPDATE`,
            [foodId]
        );

        if (
            foods.length === 0 ||
            foods[0].status !== "Available"
        ) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "This donation is unavailable or already matched."
            });
        }

        const food = foods[0];

        // Confirm that the selected NGO is eligible.
        const [ngos] = await connection.query(
            `SELECT ngo_id
             FROM NGOs
             WHERE ngo_id = ?
               AND verification_status = 'Verified'
               AND capacity > 0`,
            [ngoId]
        );

        if (ngos.length === 0) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "The selected NGO is not eligible."
            });
        }

        // Create a request for the selected NGO.
        const [requestResult] = await connection.query(
            `INSERT INTO FoodRequests (food_id, ngo_id, status)
             VALUES (?, ?, 'Pending')`,
            [foodId, ngoId]
        );

        const requestId = requestResult.insertId;

        // Generate a unique order reference.
        const orderId =
            "FHA-" + Date.now() + "-" +
            Math.floor(Math.random() * 1000);

        // Create the order.
        await connection.query(
            `INSERT INTO Orders
                (order_id, request_id, restaurant_id, ngo_id, order_status)
             VALUES (?, ?, ?, ?, 'Created')`,
            [orderId, requestId, food.restaurant_id, ngoId]
        );

        // Mark the donation as matched.
        await connection.query(
            `UPDATE FoodDonations
             SET status = 'Matched'
             WHERE food_id = ?`,
            [foodId]
        );

        // Create a delivery record for future tracking.
        await connection.query(
            `INSERT INTO Deliveries (order_id, status)
             VALUES (?, 'Assigned')`,
            [orderId]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Donation matched and order created successfully.",
            orderId: orderId,
            trackingUrl: "/track/" + encodeURIComponent(orderId),
            deliveryUrl: "/delivery/" + encodeURIComponent(orderId)
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Create order error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create the order."
        });

    } finally {
        if (connection) {
            connection.release();
        }
    }
});


app.post("/api/update-status", async (req, res) => {
    try {
        const { orderId, status } = req.body;

        const allowed = [
            "Created", "Accepted", "Driver Assigned",
            "Picked Up", "In Transit", "Delivered", "Cancelled"
        ];

        if (!allowed.includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        await db.query(
            "UPDATE Orders SET order_status = ? WHERE order_id = ?",
            [status, orderId]
        );

        res.json({ success: true, message: "Status updated!" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Update failed" });
    }
});

app.get("/orders", (req, res) => {
    res.render("orders");
});

app.get("/dashboard", (req, res) => {
    res.render("dashboard");
});

app.get("/api/dashboard", async (req, res) => {
    try {
        const [[donations]] = await db.query(`
            SELECT COUNT(*) AS total,
                   SUM(status = 'Available') AS available
            FROM FoodDonations
        `);

        const [[orders]] = await db.query(`
            SELECT COUNT(*) AS total,
                   SUM(order_status = 'Delivered') AS delivered,
                   SUM(order_status = 'Cancelled') AS cancelled
            FROM Orders
        `);

        const [recent] = await db.query(`
            SELECT order_id, order_status, created_at
            FROM Orders
            ORDER BY created_at DESC
            LIMIT 10
        `);

        res.json({ donations, orders, recent });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Dashboard loading failed" });
    }
});


// START SERVER — keep this at the bottom
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", function() {
    console.log(`Server running on the port ${PORT}`);
});
