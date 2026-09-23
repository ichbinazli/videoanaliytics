-- CreateTable
CREATE TABLE `tenants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Europe/Istanbul',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `rawRetentionDays` SMALLINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `email` VARCHAR(190) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(120) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER') NOT NULL DEFAULT 'TENANT_VIEWER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_tenantId_isActive_idx`(`tenantId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `familyId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_userId_familyId_idx`(`userId`, `familyId`),
    INDEX `refresh_tokens_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `city` VARCHAR(80) NULL,
    `address` VARCHAR(255) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sites_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `sites_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `devices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'DECOMMISSIONED') NOT NULL DEFAULT 'ACTIVE',
    `screenLabel` VARCHAR(120) NULL,
    `appVersion` VARCHAR(32) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `lastIngestAt` DATETIME(3) NULL,
    `lastSpoolDepth` SMALLINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `devices_siteId_status_idx`(`siteId`, `status`),
    INDEX `devices_tenantId_lastSeenAt_idx`(`tenantId`, `lastSeenAt`),
    UNIQUE INDEX `devices_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `deviceId` INTEGER NOT NULL,
    `keyPrefix` CHAR(12) NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `label` VARCHAR(80) NULL,
    `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `expiresAt` DATETIME(3) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `device_api_keys_keyPrefix_key`(`keyPrefix`),
    INDEX `device_api_keys_deviceId_status_idx`(`deviceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `viewer_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sessionUuid` CHAR(36) NOT NULL,
    `tenantId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `deviceId` INTEGER NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NOT NULL,
    `durationSec` SMALLINT NOT NULL,
    `personsPassed` SMALLINT NOT NULL DEFAULT 0,
    `personsLooked` SMALLINT NOT NULL DEFAULT 0,
    `lookingSeconds` DECIMAL(8, 1) NOT NULL DEFAULT 0,
    `ageEstimate` SMALLINT NULL,
    `ageBucket` ENUM('CHILD', 'YOUTH', 'ADULT', 'MIDDLE_AGED', 'SENIOR', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `gender` ENUM('MALE', 'FEMALE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `emotion` ENUM('ANGRY', 'DISGUST', 'FEAR', 'HAPPY', 'SAD', 'SURPRISE', 'NEUTRAL', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `appVersion` VARCHAR(32) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `viewer_sessions_tenantId_startedAt_idx`(`tenantId`, `startedAt`),
    INDEX `viewer_sessions_deviceId_startedAt_idx`(`deviceId`, `startedAt`),
    INDEX `viewer_sessions_siteId_startedAt_idx`(`siteId`, `startedAt`),
    UNIQUE INDEX `viewer_sessions_deviceId_sessionUuid_key`(`deviceId`, `sessionUuid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_rollup_hourly` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `deviceId` INTEGER NOT NULL,
    `bucketStart` DATETIME(0) NOT NULL,
    `sessionCount` INTEGER NOT NULL DEFAULT 0,
    `personsPassed` INTEGER NOT NULL DEFAULT 0,
    `personsLooked` INTEGER NOT NULL DEFAULT 0,
    `lookingSeconds` DECIMAL(12, 1) NOT NULL DEFAULT 0,
    `durationSecSum` INTEGER NOT NULL DEFAULT 0,
    `ageSum` INTEGER NOT NULL DEFAULT 0,
    `ageCount` INTEGER NOT NULL DEFAULT 0,
    `emAngry` INTEGER NOT NULL DEFAULT 0,
    `emDisgust` INTEGER NOT NULL DEFAULT 0,
    `emFear` INTEGER NOT NULL DEFAULT 0,
    `emHappy` INTEGER NOT NULL DEFAULT 0,
    `emSad` INTEGER NOT NULL DEFAULT 0,
    `emSurprise` INTEGER NOT NULL DEFAULT 0,
    `emNeutral` INTEGER NOT NULL DEFAULT 0,
    `emUnknown` INTEGER NOT NULL DEFAULT 0,
    `computedAt` DATETIME(3) NOT NULL,

    INDEX `session_rollup_hourly_tenantId_bucketStart_idx`(`tenantId`, `bucketStart`),
    INDEX `session_rollup_hourly_siteId_bucketStart_idx`(`siteId`, `bucketStart`),
    UNIQUE INDEX `session_rollup_hourly_deviceId_bucketStart_key`(`deviceId`, `bucketStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demographic_rollup_daily` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `siteId` INTEGER NOT NULL,
    `deviceId` INTEGER NOT NULL,
    `bucketStart` DATETIME(0) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE', 'UNKNOWN') NOT NULL,
    `ageBucket` ENUM('CHILD', 'YOUTH', 'ADULT', 'MIDDLE_AGED', 'SENIOR', 'UNKNOWN') NOT NULL,
    `sessionCount` INTEGER NOT NULL DEFAULT 0,
    `personsLooked` INTEGER NOT NULL DEFAULT 0,
    `lookingSeconds` DECIMAL(12, 1) NOT NULL DEFAULT 0,
    `computedAt` DATETIME(3) NOT NULL,

    INDEX `demographic_rollup_daily_tenantId_bucketStart_idx`(`tenantId`, `bucketStart`),
    UNIQUE INDEX `demographic_rollup_daily_deviceId_bucketStart_gender_ageBuck_key`(`deviceId`, `bucketStart`, `gender`, `ageBucket`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rollup_dirty_buckets` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `deviceId` INTEGER NOT NULL,
    `bucketStart` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rollup_dirty_buckets_deviceId_bucketStart_key`(`deviceId`, `bucketStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sites` ADD CONSTRAINT `sites_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `devices` ADD CONSTRAINT `devices_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `devices` ADD CONSTRAINT `devices_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `sites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_api_keys` ADD CONSTRAINT `device_api_keys_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
