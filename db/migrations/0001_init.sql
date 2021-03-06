-- migrate:up

CREATE TABLE IF NOT EXISTS `Users` (
    `id` INTEGER UNSIGNED NOT NULL auto_increment,
    `malUsername` VARCHAR(255) NOT NULL,
    `malUserId` INTEGER UNSIGNED NOT NULL UNIQUE,
    `lastChecked` DATETIME,
    `tokenExpires` DATETIME,
    `accessToken` VARCHAR(2048),
    `refreshToken` VARCHAR(2048),
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,

    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `Items` (
    `id` INTEGER UNSIGNED NOT NULL auto_increment,
    `mediaType` ENUM('anime', 'manga') NOT NULL,
    `malId` INTEGER NOT NULL,
    `imgUrl` VARCHAR(255),
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,

    PRIMARY KEY (`id`),
    CONSTRAINT unique_item UNIQUE (`mediaType`, `malId`)
);

-- migrate:down

DROP TABLE IF EXISTS `Users`;
DROP TABLE IF EXISTS `Items`;
