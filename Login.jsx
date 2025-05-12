
import React, { useState } from 'react';
import axios from 'axios';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      const res = await axios.post('http://localhost:3001/login', { username, password });
      onLogin(res.data.user);
    } catch (err) {
      setError('نام کاربری یا رمز اشتباه است');
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">ورود به سیستم emed</h2>
      {error && <p className="text-red-600">{error}</p>}
      <input type="text" placeholder="نام کاربری" value={username} onChange={e => setUsername(e.target.value)} className="border p-2 w-full mb-2" />
      <input type="password" placeholder="رمز عبور" value={password} onChange={e => setPassword(e.target.value)} className="border p-2 w-full mb-2" />
      <button onClick={handleLogin} className="bg-blue-600 text-white px-4 py-2 rounded">ورود</button>
    </div>
  );
}

export default Login;
