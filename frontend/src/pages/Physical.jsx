import React, { useState } from "react";

export default function Physical() {
  const [form, setForm] = useState({
    type: "",
    quantity: "",
    rate: "",
    total: ""
  });

  const [data, setData] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    let updated = { ...form, [name]: value };

    // Auto calculate total
    if (name === "quantity" || name === "rate") {
      const qty = name === "quantity" ? value : form.quantity;
      const rate = name === "rate" ? value : form.rate;
      updated.total = qty * rate;
    }

    setForm(updated);
  };

  const handleAdd = () => {
    if (!form.type || !form.quantity || !form.rate) {
      alert("Please fill all fields");
      return;
    }

    setData([...data, form]);

    setForm({
      type: "",
      quantity: "",
      rate: "",
      total: ""
    });
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Manpower - Physical</h2>

      {/* FORM */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          name="type"
          placeholder="Type (Technician)"
          value={form.type}
          onChange={handleChange}
        />

        <input
          name="quantity"
          type="number"
          placeholder="Quantity"
          value={form.quantity}
          onChange={handleChange}
        />

        <input
          name="rate"
          type="number"
          placeholder="Rate"
          value={form.rate}
          onChange={handleChange}
        />

        <input
          name="total"
          placeholder="Total"
          value={form.total}
          readOnly
        />

        <button onClick={handleAdd}>Add</button>
      </div>

      {/* TABLE */}
      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th>Type</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          {data.map((item, index) => (
            <tr key={index}>
              <td>{item.type}</td>
              <td>{item.quantity}</td>
              <td>{item.rate}</td>
              <td>{item.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}