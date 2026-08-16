CREATE TABLE `purchase_order_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantityOrdered` int NOT NULL,
	`quantityReceived` int NOT NULL DEFAULT 0,
	CONSTRAINT `purchase_order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poNumber` varchar(40) NOT NULL,
	`supplier` varchar(160) NOT NULL,
	`status` enum('ordered','partially-delivered','delivered','cancelled') NOT NULL DEFAULT 'ordered',
	`expectedDeliveryDate` date NOT NULL,
	`actualDeliveryDate` date,
	`itemsSummary` text,
	`notes` text,
	`createdBy` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
