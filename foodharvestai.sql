-- =========================================================
-- FOOD HARVEST AI
-- DATABASE SCHEMA + SAMPLE DATA
-- Ahmedabad Demo Dataset
-- =========================================================

CREATE DATABASE food_harvest_ai;

USE food_harvest_ai;


-- =========================================================
-- 1. USERS
-- =========================================================

CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    role ENUM('Restaurant','NGO','Delivery','Admin') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 2. RESTAURANTS
-- =========================================================

CREATE TABLE Restaurants (
    restaurant_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    restaurant_name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    license_number VARCHAR(50) UNIQUE,
    opening_hours VARCHAR(100),

    CONSTRAINT fk_restaurant_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 3. NGOS
-- =========================================================

CREATE TABLE NGOs (
    ngo_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    ngo_name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    capacity INT NOT NULL,
    verification_status ENUM('Pending','Verified','Rejected')
        DEFAULT 'Pending',

    CONSTRAINT fk_ngo_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 4. DELIVERY PARTNERS
-- =========================================================

CREATE TABLE DeliveryPartners (
    driver_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    vehicle_type VARCHAR(50) NOT NULL,
    vehicle_number VARCHAR(30) NOT NULL UNIQUE,
    availability ENUM('Available','Busy','Offline')
        DEFAULT 'Available',
    current_latitude DECIMAL(10,7),
    current_longitude DECIMAL(10,7),

    CONSTRAINT fk_driver_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 5. FOOD DONATIONS
-- =========================================================

CREATE TABLE FoodDonations (
    food_id INT AUTO_INCREMENT PRIMARY KEY,

    restaurant_id INT NOT NULL,

    food_name VARCHAR(150) NOT NULL,
    category VARCHAR(80) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(30) NOT NULL,

    prepared_time DATETIME NOT NULL,
    expiry_time DATETIME NOT NULL,

    pickup_address VARCHAR(255) NOT NULL,

    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,

    image_url VARCHAR(255),

    status ENUM(
        'Available',
        'Matched',
        'Accepted',
        'Picked Up',
        'In Transit',
        'Delivered',
        'Expired',
        'Cancelled'
    ) DEFAULT 'Available',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_food_restaurant
        FOREIGN KEY (restaurant_id)
        REFERENCES Restaurants(restaurant_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_food_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_food_expiry
        CHECK (expiry_time > prepared_time)
);


-- =========================================================
-- 6. FOOD REQUESTS
-- =========================================================

CREATE TABLE FoodRequests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,

    food_id INT NOT NULL,
    ngo_id INT NOT NULL,

    request_time DATETIME DEFAULT CURRENT_TIMESTAMP,

    status ENUM(
        'Pending',
        'Accepted',
        'Rejected',
        'Cancelled',
        'Completed'
    ) DEFAULT 'Pending',

    priority_score DECIMAL(6,2),

    CONSTRAINT fk_request_food
        FOREIGN KEY (food_id)
        REFERENCES FoodDonations(food_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_request_ngo
        FOREIGN KEY (ngo_id)
        REFERENCES NGOs(ngo_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 7. DELIVERIES
-- =========================================================

CREATE TABLE Deliveries (
    delivery_id INT AUTO_INCREMENT PRIMARY KEY,

    order_id VARCHAR(30) NOT NULL UNIQUE,

    pickup_time DATETIME,

    delivery_time DATETIME,

    status ENUM(
        'Assigned',
        'Picked Up',
        'In Transit',
        'Delivered',
        'Failed'
    ) DEFAULT 'Assigned',

    route_distance DECIMAL(10,2),

    FOREIGN KEY (order_id)
        REFERENCES Orders(order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =========================================================
-- 8. NOTIFICATIONS
-- =========================================================

CREATE TABLE Notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notification_user
        FOREIGN KEY (user_id)
        REFERENCES Users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE TABLE Orders (
    order_db_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(40) UNIQUE NOT NULL,

    request_id INT NOT NULL UNIQUE,
    restaurant_id INT NOT NULL,
    ngo_id INT NOT NULL,
    driver_id INT NULL,

    order_status ENUM(
        'Created',
        'Accepted',
        'Driver Assigned',
        'Picked Up',
        'In Transit',
        'Delivered',
        'Cancelled'
    ) DEFAULT 'Created',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (request_id)
        REFERENCES FoodRequests(request_id),

    FOREIGN KEY (restaurant_id)
        REFERENCES Restaurants(restaurant_id),

    FOREIGN KEY (ngo_id)
        REFERENCES NGOs(ngo_id),

    FOREIGN KEY (driver_id)
        REFERENCES DeliveryPartners(driver_id)
        ON DELETE SET NULL
);

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX idx_food_status
ON FoodDonations(status);

CREATE INDEX idx_food_expiry
ON FoodDonations(expiry_time);

CREATE INDEX idx_food_location
ON FoodDonations(latitude, longitude);

CREATE INDEX idx_ngo_location
ON NGOs(latitude, longitude);

CREATE INDEX idx_request_status
ON FoodRequests(status);

CREATE INDEX idx_delivery_status
ON Deliveries(status);

CREATE INDEX idx_notification_user
ON Notifications(user_id);

INSERT INTO Users
(full_name, email, password, phone, role)
VALUES

('Food Hub Ahmedabad',
 'restaurant1@gmail.com',
 'password123',
 '9000000001',
 'Restaurant'),

('Spice Route Restaurant',
 'restaurant2@gmail.com',
 'password123',
 '9000000002',
 'Restaurant'),

('Green Leaf Kitchen',
 'restaurant3@gmail.com',
 'password123',
 '9000000003',
 'Restaurant'),

('Urban Tadka',
 'restaurant4@gmail.com',
 'password123',
 '9000000004',
 'Restaurant'),

('Royal Feast',
 'restaurant5@gmail.com',
 'password123',
 '9000000005',
 'Restaurant'),

('City Bites',
 'restaurant6@gmail.com',
 'password123',
 '9000000006',
 'Restaurant'),

('Taste of Ahmedabad',
 'restaurant7@gmail.com',
 'password123',
 '9000000007',
 'Restaurant'),

('Heritage Kitchen',
 'restaurant8@gmail.com',
 'password123',
 '9000000008',
 'Restaurant'),

('Fresh Plate',
 'restaurant9@gmail.com',
 'password123',
 '9000000009',
 'Restaurant'),

('Ahmedabad Food Point',
 'restaurant10@gmail.com',
 'password123',
 '9000000010',
 'Restaurant'),


('Helping Hands Ahmedabad',
 'ngo1@gmail.com',
 'password123',
 '9100000001',
 'NGO'),

('Seva Foundation',
 'ngo2@gmail.com',
 'password123',
 '9100000002',
 'NGO'),

('Annapurna Trust',
 'ngo3@gmail.com',
 'password123',
 '9100000003',
 'NGO'),

('Hope Food Foundation',
 'ngo4@gmail.com',
 'password123',
 '9100000004',
 'NGO'),

('Smile Foundation Ahmedabad',
 'ngo5@gmail.com',
 'password123',
 '9100000005',
 'NGO'),

('Care & Share',
 'ngo6@gmail.com',
 'password123',
 '9100000006',
 'NGO'),

('Food For All',
 'ngo7@gmail.com',
 'password123',
 '9100000007',
 'NGO'),

('Jeevan Jyoti Trust',
 'ngo8@gmail.com',
 'password123',
 '9100000008',
 'NGO'),

('Asha Foundation',
 'ngo9@gmail.com',
 'password123',
 '9100000009',
 'NGO'),

('Community Kitchen Ahmedabad',
 'ngo10@gmail.com',
 'password123',
 '9100000010',
 'NGO'),


('Rahul Delivery',
 'driver1@gmail.com',
 'password123',
 '9200000001',
 'Delivery'),

('Amit Delivery',
 'driver2@gmail.com',
 'password123',
 '9200000002',
 'Delivery'),

('Karan Delivery',
 'driver3@gmail.com',
 'password123',
 '9200000003',
 'Delivery'),

('Vijay Delivery',
 'driver4@gmail.com',
 'password123',
 '9200000004',
 'Delivery'),

('Rohit Delivery',
 'driver5@gmail.com',
 'password123',
 '9200000005',
 'Delivery'),

('Nikhil Delivery',
 'driver6@gmail.com',
 'password123',
 '9200000006',
 'Delivery'),

('Suresh Delivery',
 'driver7@gmail.com',
 'password123',
 '9200000007',
 'Delivery'),

('Manish Delivery',
 'driver8@gmail.com',
 'password123',
 '9200000008',
 'Delivery'),

('Jay Delivery',
 'driver9@gmail.com',
 'password123',
 '9200000009',
 'Delivery'),

('Dev Delivery',
 'driver10@gmail.com',
 'password123',
 '9200000010',
 'Delivery'),


('System Administrator',
 'admin@foodharvest.ai',
 'admin123',
 '9999999999',
 'Admin');

INSERT INTO Restaurants
(user_id, restaurant_name, address, latitude, longitude,
 license_number, opening_hours)
VALUES

(1, 'Food Hub Ahmedabad',
 'Navrangpura, Ahmedabad',
 23.0395, 72.5630,
 'LIC-R001', '10:00-23:00'),

(2, 'Spice Route Restaurant',
 'Satellite, Ahmedabad',
 23.0300, 72.5100,
 'LIC-R002', '11:00-23:00'),

(3, 'Green Leaf Kitchen',
 'Bodakdev, Ahmedabad',
 23.0400, 72.5105,
 'LIC-R003', '10:30-22:30'),

(4, 'Urban Tadka',
 'Vastrapur, Ahmedabad',
 23.0350, 72.5290,
 'LIC-R004', '11:00-23:00'),

(5, 'Royal Feast',
 'Maninagar, Ahmedabad',
 22.9950, 72.6020,
 'LIC-R005', '11:00-22:30'),

(6, 'City Bites',
 'Paldi, Ahmedabad',
 23.0120, 72.5620,
 'LIC-R006', '10:00-22:00'),

(7, 'Taste of Ahmedabad',
 'Chandkheda, Ahmedabad',
 23.1130, 72.5860,
 'LIC-R007', '10:00-22:00'),

(8, 'Heritage Kitchen',
 'Shahibaug, Ahmedabad',
 23.0530, 72.5880,
 'LIC-R008', '11:00-23:00'),

(9, 'Fresh Plate',
 'Gurukul, Ahmedabad',
 23.0520, 72.5420,
 'LIC-R009', '10:00-22:00'),

(10, 'Ahmedabad Food Point',
 'Isanpur, Ahmedabad',
 22.9800, 72.5900,
 'LIC-R010', '11:00-22:00');
 
 INSERT INTO NGOs
(user_id, ngo_name, address, latitude, longitude,
 capacity, verification_status)
VALUES

(11, 'Helping Hands Ahmedabad',
 'Navrangpura, Ahmedabad',
 23.0410, 72.5660,
 150, 'Verified'),

(12, 'Seva Foundation',
 'Paldi, Ahmedabad',
 23.0140, 72.5600,
 200, 'Verified'),

(13, 'Annapurna Trust',
 'Maninagar, Ahmedabad',
 22.9955, 72.6040,
 250, 'Verified'),

(14, 'Hope Food Foundation',
 'Vastrapur, Ahmedabad',
 23.0360, 72.5310,
 180, 'Verified'),

(15, 'Smile Foundation Ahmedabad',
 'Satellite, Ahmedabad',
 23.0290, 72.5120,
 300, 'Verified'),

(16, 'Care & Share',
 'Bodakdev, Ahmedabad',
 23.0415, 72.5090,
 220, 'Verified'),

(17, 'Food For All',
 'Chandkheda, Ahmedabad',
 23.1150, 72.5880,
 175, 'Verified'),

(18, 'Jeevan Jyoti Trust',
 'Shahibaug, Ahmedabad',
 23.0540, 72.5900,
 160, 'Verified'),

(19, 'Asha Foundation',
 'Gurukul, Ahmedabad',
 23.0530, 72.5430,
 210, 'Verified'),

(20, 'Community Kitchen Ahmedabad',
 'Isanpur, Ahmedabad',
 22.9820, 72.5920,
 275, 'Verified');
 
 INSERT INTO DeliveryPartners
(user_id, vehicle_type, vehicle_number,
 availability, current_latitude, current_longitude)
VALUES

(21, 'Bike', 'GJ01AB1001',
 'Available', 23.0380, 72.5620),

(22, 'Bike', 'GJ01AB1002',
 'Available', 23.0300, 72.5200),

(23, 'Scooter', 'GJ01AB1003',
 'Busy', 23.0400, 72.5100),

(24, 'Bike', 'GJ01AB1004',
 'Available', 23.0350, 72.5300),

(25, 'Van', 'GJ01AB1005',
 'Available', 22.9950, 72.6000),

(26, 'Bike', 'GJ01AB1006',
 'Busy', 23.0120, 72.5600),

(27, 'Van', 'GJ01AB1007',
 'Available', 23.1120, 72.5850),

(28, 'Bike', 'GJ01AB1008',
 'Available', 23.0520, 72.5880),

(29, 'Scooter', 'GJ01AB1009',
 'Available', 23.0510, 72.5420),

(30, 'Bike', 'GJ01AB1010',
 'Offline', 22.9800, 72.5900);
 
 INSERT INTO FoodDonations
(restaurant_id, food_name, category, quantity, unit,
 prepared_time, expiry_time, pickup_address,
 latitude, longitude, image_url, status)
VALUES

(1, 'Veg Biryani', 'Rice',
 40, 'plates',
 '2026-08-22 11:00:00',
 '2026-08-22 15:00:00',
 'Navrangpura, Ahmedabad',
 23.0395, 72.5630,
 'biryani.jpg', 'Available'),

(2, 'Paneer Curry', 'Curry',
 25, 'kg',
 '2026-08-22 11:30:00',
 '2026-08-22 16:00:00',
 'Satellite, Ahmedabad',
 23.0300, 72.5100,
 'paneer.jpg', 'Available'),

(3, 'Mixed Vegetables', 'Vegetarian',
 30, 'kg',
 '2026-08-22 10:30:00',
 '2026-08-22 15:30:00',
 'Bodakdev, Ahmedabad',
 23.0400, 72.5105,
 'vegetables.jpg', 'Available'),

(4, 'Chapati', 'Bread',
 100, 'pieces',
 '2026-08-22 10:00:00',
 '2026-08-22 18:00:00',
 'Vastrapur, Ahmedabad',
 23.0350, 72.5290,
 'chapati.jpg', 'Available'),

(5, 'Dal Rice', 'Rice',
 50, 'plates',
 '2026-08-22 12:00:00',
 '2026-08-22 17:00:00',
 'Maninagar, Ahmedabad',
 22.9950, 72.6020,
 'dalrice.jpg', 'Available'),

(6, 'Pulao', 'Rice',
 35, 'plates',
 '2026-08-22 11:15:00',
 '2026-08-22 16:30:00',
 'Paldi, Ahmedabad',
 23.0120, 72.5620,
 'pulao.jpg', 'Available'),

(7, 'Khichdi', 'Rice',
 45, 'plates',
 '2026-08-22 11:45:00',
 '2026-08-22 17:00:00',
 'Chandkheda, Ahmedabad',
 23.1130, 72.5860,
 'khichdi.jpg', 'Available'),

(8, 'Gujarati Thali', 'Gujarati',
 60, 'plates',
 '2026-08-22 12:00:00',
 '2026-08-22 17:30:00',
 'Shahibaug, Ahmedabad',
 23.0530, 72.5880,
 'thali.jpg', 'Available'),

(9, 'Idli Sambar', 'South Indian',
 40, 'plates',
 '2026-08-22 09:30:00',
 '2026-08-22 14:30:00',
 'Gurukul, Ahmedabad',
 23.0520, 72.5420,
 'idli.jpg', 'Available'),

(10, 'Rotli Shaak', 'Gujarati',
 55, 'plates',
 '2026-08-22 11:30:00',
 '2026-08-22 17:00:00',
 'Isanpur, Ahmedabad',
 22.9800, 72.5900,
 'rotli.jpg', 'Available');
 
 INSERT INTO FoodRequests
(food_id, ngo_id, request_time, status, priority_score)
VALUES

(1, 1, '2026-08-22 11:20:00', 'Accepted', 92.50),

(2, 5, '2026-08-22 11:45:00', 'Accepted', 88.00),

(3, 6, '2026-08-22 11:50:00', 'Accepted', 85.50),

(4, 4, '2026-08-22 12:00:00', 'Accepted', 81.00),

(5, 3, '2026-08-22 12:15:00', 'Accepted', 94.00),

(6, 2, '2026-08-22 12:20:00', 'Accepted', 87.50),

(7, 7, '2026-08-22 12:30:00', 'Accepted', 90.00),

(8, 8, '2026-08-22 12:40:00', 'Accepted', 83.50),

(9, 9, '2026-08-22 12:50:00', 'Accepted', 96.00),

(10, 10, '2026-08-22 13:00:00', 'Accepted', 89.50);

INSERT INTO Deliveries
(
    order_id,
    pickup_time,
    delivery_time,
    status,
    route_distance
)
VALUES

(
    'FH20260822-000001',
    '2026-08-22 12:00:00',
    '2026-08-22 12:30:00',
    'Delivered',
    1.8
),

(
    'FH20260822-000002',
    '2026-08-22 12:20:00',
    '2026-08-22 12:55:00',
    'Delivered',
    3.2
),

(
    'FH20260822-000003',
    '2026-08-22 12:30:00',
    '2026-08-22 13:05:00',
    'Delivered',
    2.1
),

(
    'FH20260822-000004',
    '2026-08-22 12:40:00',
    '2026-08-22 13:10:00',
    'Delivered',
    1.5
),

(
    'FH20260822-000005',
    '2026-08-22 12:45:00',
    '2026-08-22 13:20:00',
    'Delivered',
    2.7
),

(
    'FH20260822-000006',
    '2026-08-22 12:50:00',
    '2026-08-22 13:25:00',
    'Delivered',
    1.9
),

(
    'FH20260822-000007',
    '2026-08-22 13:00:00',
    '2026-08-22 13:40:00',
    'Delivered',
    3.5
),

(
    'FH20260822-000008',
    '2026-08-22 13:05:00',
    '2026-08-22 13:45:00',
    'Delivered',
    2.4
),

(
    'FH20260822-000009',
    '2026-08-22 13:10:00',
    '2026-08-22 13:50:00',
    'Delivered',
    2.0
),

(
    'FH20260822-000010',
    '2026-08-22 13:15:00',
    '2026-08-22 14:00:00',
    'Delivered',
    3.0
); 


INSERT INTO Orders
(
    order_id,
    request_id,
    restaurant_id,
    ngo_id,
    driver_id,
    order_status
)
VALUES
('FH20260822-000001', 1, 1, 1, 1, 'Delivered'),
('FH20260822-000002', 2, 2, 5, 2, 'Delivered'),
('FH20260822-000003', 3, 3, 6, 3, 'Delivered'),
('FH20260822-000004', 4, 4, 4, 4, 'Delivered'),
('FH20260822-000005', 5, 5, 3, 5, 'Delivered'),
('FH20260822-000006', 6, 6, 2, 6, 'Delivered'),
('FH20260822-000007', 7, 7, 7, 7, 'Delivered'),
('FH20260822-000008', 8, 8, 8, 8, 'Delivered'),
('FH20260822-000009', 9, 9, 9, 9, 'Delivered'),
('FH20260822-000010', 10, 10, 10, 10, 'Delivered');

SELECT * FROM Users;

SELECT * FROM Restaurants;

SELECT * FROM NGOs;

SELECT * FROM DeliveryPartners;

SELECT * FROM FoodDonations;

SELECT * FROM FoodRequests;

SELECT * FROM Deliveries;


CREATE USER 'foodapp'@'localhost'
IDENTIFIED BY 'foodapp123';

GRANT ALL PRIVILEGES
ON food_harvest_ai.*
TO 'foodapp'@'localhost';

FLUSH PRIVILEGES;

SELECT 
    fr.request_id,
    o.order_id
FROM FoodRequests fr
LEFT JOIN Orders o
    ON fr.request_id = o.request_id;
