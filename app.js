require("dotenv").config();

const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const mysql = require("mysql2/promise");


// ========================================
// SERVER SETUP
// ========================================

const server = http.createServer(app);
const io = socketio(server);


// ========================================
// MIDDLEWARE
// ========================================

app.set("view engine", "ejs");

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.use(express.json());


// ========================================
// MYSQL CONNECTION
// ========================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: {
        ca: fs.readFileSync(
            path.join(__dirname, "ca.pem")
        )
    },

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


// ========================================
// TEST MYSQL CONNECTION
// ========================================

async function testDatabase() {

    try {

        const [rows] = await db.query(
            "SELECT COUNT(*) AS total FROM Orders"
        );

        console.log("MySQL connected");

        console.log(
            "Total orders:",
            rows[0].total
        );

    } catch (error) {

        console.error(
            "MySQL connection failed:",
            error.message
        );

    }

}

testDatabase();


// ========================================
// SOCKET.IO
// REAL-TIME TRACKING
// ========================================

io.on("connection", function(socket) {

    console.log(
        "User connected:",
        socket.id
    );


    // ------------------------------------
    // JOIN ORDER ROOM
    // ------------------------------------

    socket.on(
        "join-order",
        function(data) {

            const {
                orderId,
                role
            } = data;


            if (!orderId || !role) {

                return;

            }


            // Join room using order ID

            socket.join(orderId);


            // Store information on socket

            socket.orderId = orderId;

            socket.role = role;


            console.log(
                `${role} joined order ${orderId}`
            );

        }
    );


    // ------------------------------------
    // DELIVERY SENDS LOCATION
    // ------------------------------------

    socket.on(
        "send-location",
        function(data) {


            // Check order

            if (!socket.orderId) {

                return;

            }


            // Only delivery device
            // can send location

            if (socket.role !== "delivery") {

                return;

            }


            console.log(
                "Location received:",
                data.latitude,
                data.longitude
            );


            // Send location to
            // everyone in same order room

            io.to(socket.orderId).emit(
                "receive-location",
                {

                    latitude:
                        data.latitude,

                    longitude:
                        data.longitude

                }
            );

        }
    );


    // ------------------------------------
    // DISCONNECT
    // ------------------------------------

    socket.on(
        "disconnect",
        function() {

            console.log(
                "User disconnected:",
                socket.id
            );

        }
    );

});


// ========================================
// PAGE ROUTES
// ========================================


// ----------------------------------------
// HOME PAGE
// ----------------------------------------

app.get(
    "/",
    function(req, res) {

        res.render("index");

    }
);

// ----------------------------------------
// DONATE FOOD PAGE
// ----------------------------------------

app.get(
    "/donate",
    function(req, res) {

        res.render("donate");

    }
);


// ----------------------------------------
// AI MATCHING PAGE
// ----------------------------------------

app.get(
    "/matching",
    function(req, res) {

        res.render("matching");

    }
);


// ----------------------------------------
// DELIVERY TRACKING PAGE
// ----------------------------------------

app.get(
    "/delivery/:orderId",
    function(req, res) {

        res.render(
            "delivery",
            {

                orderId:
                    req.params.orderId

            }
        );

    }
);


// ----------------------------------------
// NGO / CLIENT TRACKING PAGE
// ----------------------------------------

app.get(
    "/track/:orderId",
    function(req, res) {

        res.render(
            "track",
            {

                orderId:
                    req.params.orderId

            }
        );

    }
);

// ========================================
// SAVE FOOD DONATION TO MYSQL
// ========================================

app.post("/api/donations", async function(req, res) {
    try {
        const {
            food_name,
            category,
            quantity,
            unit,
            pickup_address
        } = req.body;

        // Validate form data
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

        // Prototype: use existing restaurant ID 1
        const restaurantId = 1;

        // Get coordinates for the existing restaurant
      // Get coordinates for the existing restaurant
const [restaurants] = await db.query(
    "SELECT latitude, longitude " +
    "FROM Restaurants " +
    "WHERE restaurant_id = ?",
    [restaurantId]
);

      if (restaurants.length === 0) {
    return res.status(400).json({
        success: false,
        error: "Restaurant record not found."
    });
}

        // Set preparation time to now and expiry to 24 hours later
        const preparedTime = new Date();
        const expiryTime = new Date(
            preparedTime.getTime() + 24 * 60 * 60 * 1000
        );

        // Format dates for MySQL DATETIME
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
// ========================================
// FIND NEAREST VERIFIED NGO FOR A DONATION
// ========================================

app.get("/api/matching-ngo", async function(req, res) {
    try {
        const foodId = Number(req.query.foodId);

        if (!Number.isInteger(foodId) || foodId <= 0) {
            return res.status(400).json({
                success: false,
                error: "A valid foodId is required."
            });
        }

        // Retrieve the saved donation
        const [foods] = await db.query(
            "SELECT food_id, food_name, quantity, unit, latitude, longitude " +
            "FROM FoodDonations " +
            "WHERE food_id = ? AND status = 'Available'",
            [foodId]
        );

        if (foods.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Donation not found or no longer available."
            });
        }

        const food = foods[0];

        // Find the nearest verified NGO with positive capacity
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
             LIMIT 1`,
            [
                food.latitude,
                food.longitude,
                food.latitude
            ]
        );

        if (ngos.length === 0) {
            return res.status(404).json({
                success: false,
                error: "No verified NGO with available capacity was found."
            });
        }

        return res.json({
            success: true,
            food: {
                food_id: food.food_id,
                food_name: food.food_name,
                quantity: food.quantity,
                unit: food.unit
            },
            ngo: {
                ngo_id: ngos[0].ngo_id,
                ngo_name: ngos[0].ngo_name,
                address: ngos[0].address,
                capacity: ngos[0].capacity,
                distance_km: Number(ngos[0].distance_km)
            }
        });

    } catch (error) {
        console.error("NGO matching error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to find a matching NGO."
        });
    }
});


// ========================================
// GET EXISTING ORDER DETAILS
// ========================================

app.get(
    "/api/orders/:orderId",
    async function(req, res) {

        try {

            const orderId =
                req.params.orderId;


            console.log(
                "Searching for order:",
                orderId
            );


            const [rows] =
                await db.query(

                    `

                    SELECT

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

                        ON o.request_id =
                           fr.request_id


                    JOIN FoodDonations f

                        ON fr.food_id =
                           f.food_id


                    JOIN Restaurants r

                        ON o.restaurant_id =
                           r.restaurant_id


                    JOIN NGOs n

                        ON o.ngo_id =
                           n.ngo_id


                    LEFT JOIN DeliveryPartners dp

                        ON o.driver_id =
                           dp.driver_id


                    WHERE o.order_id = ?

                    `,

                    [orderId]

                );


            // --------------------------------
            // ORDER NOT FOUND
            // --------------------------------

            if (rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Order not found"

                });

            }


            // --------------------------------
            // SEND ORDER
            // --------------------------------

            res.json({

                success: true,

                order: rows[0]

            });


        } catch (error) {


            console.error(
                "Database error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Database error"

            });

        }

    }
);


// ========================================
// MATCHING PRINCIPLE
// ========================================
//
// Input:
//     foodId
//
// Output:
//     Best NGO
//     Existing order_id
//     Delivery URL
//     Tracking URL
//
// NO ORDER IS CREATED HERE.
// ========================================

app.post(
    "/api/matching",
    async function(req, res) {

        try {


            // --------------------------------
            // GET FOOD ID
            // --------------------------------

            const {
                foodId
            } = req.body;


            if (!foodId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "foodId is required"

                });

            }


            console.log(
                "Running matching for food:",
                foodId
            );


            // --------------------------------
            // MATCHING QUERY
            // --------------------------------

            const [rows] =
                await db.query(

                    `

                    SELECT

                        n.ngo_id,

                        n.ngo_name,

                        o.order_id,


                        (

                            LEAST(
                                f.quantity /
                                n.capacity,
                                1
                            ) * 40


                            +


                            (

                                1 /

                                (

                                    1 +

                                    (

                                        6371 * ACOS(

                                            COS(
                                                RADIANS(
                                                    f.latitude
                                                )
                                            )

                                            *

                                            COS(
                                                RADIANS(
                                                    n.latitude
                                                )
                                            )

                                            *

                                            COS(

                                                RADIANS(
                                                    n.longitude
                                                )

                                                -

                                                RADIANS(
                                                    f.longitude
                                                )

                                            )

                                            +

                                            SIN(
                                                RADIANS(
                                                    f.latitude
                                                )
                                            )

                                            *

                                            SIN(
                                                RADIANS(
                                                    n.latitude
                                                )
                                            )

                                        )

                                    )

                                )

                            ) * 60


                        ) AS MatchingScore


                    FROM FoodDonations f


                    JOIN NGOs n

                        ON n.capacity > 0


                    JOIN FoodRequests fr

                        ON fr.food_id =
                           f.food_id

                        AND fr.ngo_id =
                            n.ngo_id


                    JOIN Orders o

                        ON o.request_id =
                           fr.request_id

                        AND o.ngo_id =
                            n.ngo_id


                    WHERE f.food_id = ?

                        AND f.status =
                            'Available'

                        AND n.verification_status =
                            'Verified'

                        AND fr.status =
                            'Pending'


                    ORDER BY
                        MatchingScore DESC


                    LIMIT 1

                    `,

                    [foodId]

                );


            // --------------------------------
            // NO MATCH FOUND
            // --------------------------------

            if (rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "No matching order found"

                });

            }


            // --------------------------------
            // GET MATCHED ORDER
            // --------------------------------

            const matchedOrder =
                rows[0];


            const orderId =
                matchedOrder.order_id;


            // --------------------------------
            // GENERATE BASE URL
            // --------------------------------

            const baseUrl =
                `${req.protocol}://${req.get("host")}`;


            // --------------------------------
            // GENERATE DELIVERY URL
            // --------------------------------

            const deliveryUrl =
                `${baseUrl}/delivery/${orderId}`;


            // --------------------------------
            // GENERATE TRACKING URL
            // --------------------------------

            const trackingUrl =
                `${baseUrl}/track/${orderId}`;


            // --------------------------------
            // SEND RESULT
            // --------------------------------

            res.json({

                success: true,

                ngoId:
                    matchedOrder.ngo_id,

                ngoName:
                    matchedOrder.ngo_name,

                orderId:
                    orderId,

                matchingScore:
                    matchedOrder.MatchingScore,

                deliveryUrl:
                    deliveryUrl,

                trackingUrl:
                    trackingUrl

            });


        } catch (error) {


            console.error(
                "Matching error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Matching failed"

            });

        }

    }
);


// ========================================
// START SERVER
// ========================================

const PORT =
    process.env.PORT || 3000;

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


server.listen(
    PORT,
    "0.0.0.0",
    function() {

        console.log(
            `Server running on the port ${PORT}`
        );

    }
);
