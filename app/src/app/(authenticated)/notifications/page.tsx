"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Check, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Notification, NotificationType, NotificationRefType, NotificationListResult } from "@/types/notification";
import {
  NOTIFICATION_TYPE_COLORS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_REF_TYPE_LABELS,
  NOTIFICATION_ROUTES,
} from "@/types/notification";

export default function NotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [totalCount, setTotalCount] = useState(0);
  const isInitialMount = useRef(true);

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "50",
        offset: String((pageNum - 1) * 50),
        unread_only: filter === "unread" ? "true" : "false",
      });
      const response = await fetch(`/api/notifications?${params}`);
      if (response.ok) {
        const data: NotificationListResult = await response.json();
        if (append) {
          setNotifications(prev => [...prev, ...data.notifications]);
        } else {
          setNotifications(data.notifications);
        }
        setTotalCount(data.total_count);
        setUnreadCount(data.unread_count);
        setHasMore(data.notifications.length === 50);
        setPage(pageNum);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count");
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(1, false);
    fetchUnreadCount();
  }, [fetchNotifications, filter, fetchUnreadCount]);

  const handleMarkRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    const route = NOTIFICATION_ROUTES[notification.ref_type];
    if (route) {
      router.push(route(notification.ref_id));
      if (!notification.is_read) {
        handleMarkRead(notification.id);
      }
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-[var(--muted)]">View and manage your notifications</p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="rounded-sm border border-gray-300 px-4 py-2 text-sm font-medium bg-white hover:bg-gray-50"
          >
            <Check className="w-4 h-4 mr-2 inline" />
            Mark all as read ({unreadCount})
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === "all"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full">{totalCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === "unread"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Unread <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">{unreadCount}</span>
        </button>
      </div>

      {/* Notifications List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {isLoading && notifications.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {notifications.length === 0 && !isLoading && (
          <div className="py-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {filter === "unread" ? "All caught up!" : "Notifications will appear here when events occur"}
            </p>
          </div>
        )}

        <ul className="divide-y divide-gray-100" role="list" aria-label="Notifications">
          {notifications.map(notification => (
            <li
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`relative cursor-pointer px-6 py-4 transition-colors ${
                notification.is_read
                  ? "bg-white hover:bg-gray-50"
                  : "bg-blue-50/50 hover:bg-blue-50"
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-4">
                {/* Type indicator */}
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    NOTIFICATION_TYPE_COLORS[notification.type as NotificationType] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  <Bell className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className={`text-base font-medium ${notification.is_read ? "text-gray-900" : "text-gray-900 font-semibold"}`}>
                          {notification.title}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                            NOTIFICATION_TYPE_COLORS[notification.type as NotificationType] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {NOTIFICATION_TYPE_LABELS[notification.type as NotificationType] || notification.type}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {NOTIFICATION_REF_TYPE_LABELS[notification.ref_type as NotificationRefType] || notification.ref_type}
                        </span>
                      </div>
                      <p className={`mt-2 ${notification.is_read ? "text-gray-500" : "text-gray-700"}`}>
                        {notification.message}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3">
                      <span className="text-sm text-gray-400 whitespace-nowrap hidden sm:block">
                        {formatTimeAgo(notification.created_at)}
                      </span>
                      {!notification.is_read && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkRead(notification.id);
                          }}
                          className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          aria-label="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span>Created:</span>
                      <span>{formatDate(notification.created_at)}</span>
                    </span>
                    {notification.read_at && (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="w-3 h-3" />
                        <span>Read: {formatDate(notification.read_at)}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Unread indicator */}
                {!notification.is_read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent)] rounded-l-lg" />
                )}
              </div>
            </li>
          ))}

          {hasMore && !isLoading && (
            <li className="py-4 text-center">
              <button
                type="button"
                onClick={() => fetchNotifications(page + 1, true)}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                Load more notifications
              </button>
            </li>
          )}

          {isLoading && notifications.length > 0 && (
            <li className="py-4 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto" />
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}