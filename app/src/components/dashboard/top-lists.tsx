"use client";

import Link from "next/link";
import type { TopProduct, TopCustomer, LowStockItem, UpcomingDelivery } from "@/types/dashboard";

const formatCurrency = (value: string | number) => {
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatNumber = (value: string | number) => {
  return Number(value).toLocaleString("en-IN");
};

interface TopProductsListProps {
  products: TopProduct[];
}

export function TopProductsList({ products }: TopProductsListProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">🏆</span> Top Products
        </h3>
        <div className="text-center py-8 text-gray-500">No products found</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-xl">🏆</span> Top Products
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty Sold</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {products.map((product, index) => (
              <tr key={product.product_id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <Link href={`/products/${product.product_id}`} className="font-medium text-gray-900 hover:text-[var(--accent)]">
                    {product.product_name}
                  </Link>
                  {product.product_sku && (
                    <p className="text-xs text-gray-500 font-mono">{product.product_sku}</p>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-900">{formatNumber(product.total_quantity)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900">₹{formatCurrency(product.total_revenue)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{formatNumber(product.order_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TopCustomersListProps {
  customers: TopCustomer[];
}

export function TopCustomersList({ customers }: TopCustomersListProps) {
  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">👥</span> Top Customers
        </h3>
        <div className="text-center py-8 text-gray-500">No customers found</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-xl">👥</span> Top Customers
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {customers.map((customer) => (
              <tr key={customer.customer_id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <Link href={`/customers/${customer.customer_id}`} className="font-medium text-gray-900 hover:text-[var(--accent)]">
                    {customer.customer_name}
                  </Link>
                  {customer.company_name && (
                    <p className="text-xs text-gray-500">{customer.company_name}</p>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-900">{formatNumber(customer.total_orders)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-gray-900">₹{formatCurrency(customer.total_revenue)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-green-600">₹{formatCurrency(customer.total_paid)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-red-600">₹{formatCurrency(customer.total_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface LowStockItemsListProps {
  items: LowStockItem[];
}

export function LowStockItemsList({ items }: LowStockItemsListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">⚠️</span> Low Stock Items
        </h3>
        <div className="text-center py-8 text-green-600">All items well stocked ✓</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-xl">⚠️</span> Low Stock Items
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Current</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reserved</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.raw_material_id} className="hover:bg-gray-50">
                <td className="px-3 py-3">
                  <Link href={`/raw-materials/${item.raw_material_id}`} className="font-medium text-gray-900 hover:text-[var(--accent)]">
                    {item.name}
                  </Link>
                  {item.code && <p className="text-xs text-gray-500 font-mono">{item.code}</p>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-900">{formatNumber(item.current_stock)} {item.unit}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{formatNumber(item.reserved_stock)} {item.unit}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-red-600">{formatNumber(item.available_stock)} {item.unit}</td>
                <td className="px-3 py-3 text-right tabular-nums text-gray-600">{formatNumber(item.reorder_level)} {item.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  PACKED: "bg-blue-100 text-blue-800",
  DISPATCHED: "bg-indigo-100 text-indigo-800",
  IN_TRANSIT: "bg-yellow-100 text-yellow-800",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PACKED: "Packed",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In Transit",
};

interface UpcomingDeliveriesListProps {
  deliveries: UpcomingDelivery[];
}

export function UpcomingDeliveriesList({ deliveries }: UpcomingDeliveriesListProps) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="text-xl">🚚</span> Upcoming Deliveries
        </h3>
        <div className="text-center py-8 text-gray-500">No upcoming deliveries</div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", weekday: "short" });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-xl">🚚</span> Upcoming Deliveries
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle / Driver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deliveries.map((delivery) => (
              <tr key={delivery.delivery_id} className="hover:bg-gray-50">
                <td className="px-3 py-3 font-mono text-gray-900">{delivery.delivery_number}</td>
                <td className="px-3 py-3">
                  <Link href={`/orders/${delivery.order_number}`} className="font-medium text-gray-900 hover:text-[var(--accent)]">
                    {delivery.order_number}
                  </Link>
                </td>
                <td className="px-3 py-3 text-gray-900">{delivery.customer_name ?? "—"}</td>
                <td className="px-3 py-3 text-gray-600">{formatDate(delivery.expected_delivery_date)}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DELIVERY_STATUS_COLORS[delivery.status] || "bg-gray-100 text-gray-800"}`}>
                    {DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-600">
                  {(delivery.vehicle || delivery.driver) && (
                    <>
                      {delivery.vehicle && <span className="font-mono">{delivery.vehicle}</span>}
                      {delivery.vehicle && delivery.driver && <span className="mx-1 text-gray-300">/</span>}
                      {delivery.driver && <span>{delivery.driver}</span>}
                    </>
                  )}
                  {!delivery.vehicle && !delivery.driver && <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}