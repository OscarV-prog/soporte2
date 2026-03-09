import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

describe('GET /api', () => {
  it('should return a message', async () => {
    const res = await axios.get(API_URL);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'Hello API' });
  });
});
