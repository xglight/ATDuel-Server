/**
 * @file 数据库表结构定义
 */

export const tableDefinitions = {
    user: `
        CREATE TABLE IF NOT EXISTS user (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            ATName VARCHAR(255),
            acLastUpdate BIGINT DEFAULT 0,
            rating INT DEFAULT 0,
            avatar VARCHAR(255)
        )`,
    user_problem_accept: `
        CREATE TABLE IF NOT EXISTS user_problem_accept (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            problem_id VARCHAR(255) NOT NULL,
            INDEX idx_username (username),
            INDEX idx_problem_id (problem_id)
        )`,
    problem: `
        CREATE TABLE IF NOT EXISTS problem (
            id INT AUTO_INCREMENT PRIMARY KEY,
            problem_id VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            contest VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL,
            url VARCHAR(255) NOT NULL,
            difficulty INT NOT NULL
        )`,
    contest: `
        CREATE TABLE IF NOT EXISTS contest (
            id INT AUTO_INCREMENT PRIMARY KEY,
            url VARCHAR(255) NOT NULL UNIQUE,
            master VARCHAR(255) NOT NULL,
            startTime DATETIME,
            endTime DATETIME,
            scorea INT DEFAULT 0,
            scoreb INT DEFAULT 0,
            status INT DEFAULT 0,
            rated BOOLEAN DEFAULT false
        )`,
    contest_teams: `
        CREATE TABLE IF NOT EXISTS contest_teams (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contest_id INT NOT NULL,
            team_label VARCHAR(10) NOT NULL,
            username VARCHAR(255) NOT NULL,
            INDEX idx_contest_id (contest_id)
        )`,
    contest_participants: `
        CREATE TABLE IF NOT EXISTS contest_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contest_id INT NOT NULL,
            username VARCHAR(255) NOT NULL,
            score INT DEFAULT 0,
            place INT DEFAULT 0,
            avatar VARCHAR(255),
            INDEX idx_contest_id (contest_id),
            INDEX idx_username (username)
        )`,
    contest_problems: `
        CREATE TABLE IF NOT EXISTS contest_problems (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contest_id INT NOT NULL,
            problem_id INT,
            title VARCHAR(255),
            url VARCHAR(255),
            score INT DEFAULT 0,
            status INT DEFAULT 0,
            difficulty INT DEFAULT 0,
            acuser VARCHAR(255),
            INDEX idx_contest_id (contest_id)
        )`,
    contest_submissions: `
        CREATE TABLE IF NOT EXISTS contest_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contest_id INT NOT NULL,
            username VARCHAR(255) NOT NULL,
            task_title VARCHAR(255),
            status VARCHAR(50),
            submission_time VARCHAR(255),
            INDEX idx_contest_id (contest_id),
            INDEX idx_username (username)
        )`,
    contest_ratings: `
        CREATE TABLE IF NOT EXISTS contest_ratings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            contest_id INT NOT NULL,
            username VARCHAR(255) NOT NULL,
            old_rating INT,
            new_rating INT,
            delta INT,
            INDEX idx_contest_id (contest_id),
            INDEX idx_username (username)
        )`,
    login_status: `
        CREATE TABLE IF NOT EXISTS login_status (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            token VARCHAR(255) NOT NULL,
            loginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            rememberMe TINYINT DEFAULT 0
        )`,
    room: `
        CREATE TABLE IF NOT EXISTS room (
            id INT AUTO_INCREMENT PRIMARY KEY,
            url VARCHAR(255) NOT NULL UNIQUE,
            master VARCHAR(255) NOT NULL,
            setting_mode VARCHAR(50),
            setting_rating_lowest INT,
            setting_rating_highest INT,
            setting_problem_count INT,
            setting_categories VARCHAR(255),
            rated BOOLEAN DEFAULT false,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
    room_participants: `
        CREATE TABLE IF NOT EXISTS room_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            username VARCHAR(255) NOT NULL,
            team_label VARCHAR(10) NOT NULL,
            place INT NOT NULL,
            ready BOOLEAN DEFAULT false,
            avatar VARCHAR(255),
            INDEX idx_room_id (room_id),
            INDEX idx_username (username)
        )`,
    room_messages: `
        CREATE TABLE IF NOT EXISTS room_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_url VARCHAR(255) NOT NULL,
            sender VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_room_url (room_url)
        )`,
    contest_messages: `
        CREATE TABLE IF NOT EXISTS contest_messages (
            id SERIAL PRIMARY KEY,
            type VARCHAR(30) NOT NULL,
            contest_id VARCHAR(50) NOT NULL,
            team_id VARCHAR(50),
            sender VARCHAR(50) NOT NULL,
            message TEXT NOT NULL,
            mode VARCHAR(10) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    user_ban: `
        CREATE TABLE IF NOT EXISTS user_ban (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            startBanTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            endBanTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            reason TEXT
        )`,
    ip_ban: `
        CREATE TABLE IF NOT EXISTS ip_ban (
            id SERIAL PRIMARY KEY,
            ip VARCHAR(255) NOT NULL,
            startBanTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            endBanTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            reason TEXT
        )`,
    admin_status: `
        CREATE TABLE IF NOT EXISTS admin_status (
            id INT AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(255) NOT NULL,
            loginTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    admins: `
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
    bulletin: `
        CREATE TABLE IF NOT EXISTS bulletin (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`
};
