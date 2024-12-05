
CREATE TABLE playing_with_neon (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value FLOAT NOT NULL
);

INSERT INTO playing_with_neon (name, value) VALUES
('test', 1.0),
('test2', 2.0),
('test3', 3.0);
