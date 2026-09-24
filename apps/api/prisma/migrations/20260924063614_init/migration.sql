-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(160) NOT NULL,
    `role` ENUM('ADMIN', 'LECTURER', 'STUDENT') NOT NULL,
    `status` ENUM('ACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `avatar_url` VARCHAR(512) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_code_key`(`code`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_status_idx`(`role`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `user_agent` VARCHAR(512) NULL,
    `ip_address` VARCHAR(64) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_revoked_at_idx`(`user_id`, `revoked_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_resets` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_resets_token_hash_key`(`token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subjects` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `credits` INTEGER NOT NULL DEFAULT 3,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subjects_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_classes` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `semester` VARCHAR(32) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('OPEN', 'LOCKED', 'ARCHIVED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `course_classes_code_key`(`code`),
    INDEX `course_classes_subject_id_idx`(`subject_id`),
    INDEX `course_classes_lecturer_id_idx`(`lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(191) NOT NULL,
    `course_class_id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enrollments_student_id_idx`(`student_id`),
    UNIQUE INDEX `enrollments_course_class_id_student_id_key`(`course_class_id`, `student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_rooms` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `building` VARCHAR(64) NULL,
    `seat_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `exam_rooms_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_ip_rules` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `cidr` VARCHAR(64) NOT NULL,
    `note` VARCHAR(255) NULL,

    INDEX `room_ip_rules_room_id_idx`(`room_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `action` VARCHAR(80) NOT NULL,
    `entity_type` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(64) NULL,
    `payload` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_actor_id_created_at_idx`(`actor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapters` (
    `id` VARCHAR(191) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `chapters_subject_id_code_key`(`subject_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` VARCHAR(191) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `chapter_id` VARCHAR(191) NOT NULL,
    `type` ENUM('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE') NOT NULL,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `content` TEXT NOT NULL,
    `image_url` VARCHAR(512) NULL,
    `explanation` TEXT NULL,
    `default_score` DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `questions_subject_id_chapter_id_difficulty_status_idx`(`subject_id`, `chapter_id`, `difficulty`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_options` (
    `id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(4) NOT NULL,
    `content` TEXT NOT NULL,
    `is_correct` BOOLEAN NOT NULL DEFAULT false,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `question_options_question_id_idx`(`question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `source` ENUM('EXCEL', 'WORD_PANDOC') NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `file_name` VARCHAR(255) NOT NULL,
    `total_rows` INTEGER NOT NULL DEFAULT 0,
    `success_rows` INTEGER NOT NULL DEFAULT 0,
    `failed_rows` INTEGER NOT NULL DEFAULT 0,
    `errors` JSON NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,

    INDEX `import_jobs_created_by_id_created_at_idx`(`created_by_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proctoring_policies` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `mode` ENUM('LAB', 'REMOTE') NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `signals_enabled` JSON NOT NULL,
    `thresholds` JSON NOT NULL,
    `action_on_exceed` ENUM('WARN', 'FLAG', 'AUTO_SUBMIT') NOT NULL DEFAULT 'FLAG',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exams` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `subject_id` VARCHAR(191) NOT NULL,
    `course_class_id` VARCHAR(191) NOT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `open_at` DATETIME(3) NOT NULL,
    `close_at` DATETIME(3) NOT NULL,
    `shuffle_questions` BOOLEAN NOT NULL DEFAULT true,
    `shuffle_options` BOOLEAN NOT NULL DEFAULT true,
    `result_display` ENUM('NONE', 'SCORE_ONLY', 'WITH_ANSWERS') NOT NULL DEFAULT 'SCORE_ONLY',
    `total_score` DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    `strict_multiple_choice` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('DRAFT', 'PUBLISHED', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `proctoring_mode` ENUM('LAB', 'REMOTE') NOT NULL DEFAULT 'LAB',
    `policy_id` VARCHAR(191) NULL,
    `room_id` VARCHAR(191) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exams_course_class_id_status_idx`(`course_class_id`, `status`),
    INDEX `exams_open_at_close_at_idx`(`open_at`, `close_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_matrix_items` (
    `id` VARCHAR(191) NOT NULL,
    `exam_id` VARCHAR(191) NOT NULL,
    `chapter_id` VARCHAR(191) NOT NULL,
    `difficulty` ENUM('EASY', 'MEDIUM', 'HARD') NOT NULL,
    `quantity` INTEGER NOT NULL,

    UNIQUE INDEX `exam_matrix_items_exam_id_chapter_id_difficulty_key`(`exam_id`, `chapter_id`, `difficulty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attempts` (
    `id` VARCHAR(191) NOT NULL,
    `exam_id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `status` ENUM('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'TERMINATED') NOT NULL DEFAULT 'IN_PROGRESS',
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deadline_at` DATETIME(3) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `proctoring_mode` ENUM('LAB', 'REMOTE') NOT NULL,
    `session_id` VARCHAR(64) NULL,
    `ip_address` VARCHAR(64) NULL,
    `machine_code` VARCHAR(32) NULL,
    `consent_at` DATETIME(3) NULL,
    `last_heartbeat_at` DATETIME(3) NULL,
    `violation_count` INTEGER NOT NULL DEFAULT 0,
    `score` DECIMAL(5, 2) NULL,
    `correct_count` INTEGER NULL,
    `graded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attempts_exam_id_status_idx`(`exam_id`, `status`),
    UNIQUE INDEX `attempts_exam_id_student_id_key`(`exam_id`, `student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attempt_questions` (
    `id` VARCHAR(191) NOT NULL,
    `attempt_id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `order_index` INTEGER NOT NULL,
    `option_order` JSON NOT NULL,

    INDEX `attempt_questions_attempt_id_order_index_idx`(`attempt_id`, `order_index`),
    UNIQUE INDEX `attempt_questions_attempt_id_question_id_key`(`attempt_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attempt_answers` (
    `id` VARCHAR(191) NOT NULL,
    `attempt_question_id` VARCHAR(191) NOT NULL,
    `selected_option_ids` JSON NOT NULL,
    `flagged` BOOLEAN NOT NULL DEFAULT false,
    `answered_at` DATETIME(3) NOT NULL,
    `is_correct` BOOLEAN NULL,
    `earned_score` DECIMAL(5, 2) NULL,

    UNIQUE INDEX `attempt_answers_attempt_question_id_key`(`attempt_question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proctoring_events` (
    `id` VARCHAR(191) NOT NULL,
    `attempt_id` VARCHAR(191) NOT NULL,
    `type` ENUM('TAB_BLUR', 'WINDOW_BLUR', 'PASTE', 'HEARTBEAT_LOST', 'IP_OUT_OF_RANGE', 'FACE_ABSENT', 'FACE_MULTIPLE', 'FACE_AWAY', 'CAMERA_BLOCKED') NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `duration_ms` INTEGER NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `proctoring_events_attempt_id_occurred_at_idx`(`attempt_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `violations` (
    `id` VARCHAR(191) NOT NULL,
    `attempt_id` VARCHAR(191) NOT NULL,
    `type` ENUM('TAB_BLUR', 'WINDOW_BLUR', 'PASTE', 'HEARTBEAT_LOST', 'IP_OUT_OF_RANGE', 'FACE_ABSENT', 'FACE_MULTIPLE', 'FACE_AWAY', 'CAMERA_BLOCKED') NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
    `occurred_at` DATETIME(3) NOT NULL,
    `sequence_no` INTEGER NOT NULL,
    `note` VARCHAR(512) NULL,
    `evidence_url` VARCHAR(512) NULL,
    `evidence_expires_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `violations_attempt_id_occurred_at_idx`(`attempt_id`, `occurred_at`),
    INDEX `violations_evidence_expires_at_idx`(`evidence_expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_analyses` (
    `id` VARCHAR(191) NOT NULL,
    `exam_id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `p_value` DECIMAL(4, 3) NOT NULL,
    `discrimination_index` DECIMAL(4, 3) NOT NULL,
    `total_answers` INTEGER NOT NULL,
    `correct_answers` INTEGER NOT NULL,
    `option_distribution` JSON NOT NULL,
    `computed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `item_analyses_exam_id_question_id_key`(`exam_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_classes` ADD CONSTRAINT `course_classes_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_classes` ADD CONSTRAINT `course_classes_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_course_class_id_fkey` FOREIGN KEY (`course_class_id`) REFERENCES `course_classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `room_ip_rules` ADD CONSTRAINT `room_ip_rules_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `exam_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_chapter_id_fkey` FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `question_options` ADD CONSTRAINT `question_options_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_course_class_id_fkey` FOREIGN KEY (`course_class_id`) REFERENCES `course_classes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `proctoring_policies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `exam_rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_matrix_items` ADD CONSTRAINT `exam_matrix_items_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_matrix_items` ADD CONSTRAINT `exam_matrix_items_chapter_id_fkey` FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attempt_questions` ADD CONSTRAINT `attempt_questions_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attempt_questions` ADD CONSTRAINT `attempt_questions_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attempt_answers` ADD CONSTRAINT `attempt_answers_attempt_question_id_fkey` FOREIGN KEY (`attempt_question_id`) REFERENCES `attempt_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proctoring_events` ADD CONSTRAINT `proctoring_events_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `violations` ADD CONSTRAINT `violations_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_analyses` ADD CONSTRAINT `item_analyses_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_analyses` ADD CONSTRAINT `item_analyses_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
