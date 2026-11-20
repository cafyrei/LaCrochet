from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, func

from database import Base


class Address(Base):
    __tablename__ = "addresses"

    address_id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_name = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=False)
    street = Column(String(255), nullable=False)
    barangay = Column(String(100), nullable=False)
    city = Column(String(100), nullable=False)
    province = Column(String(100), nullable=False)
    postal_code = Column(String(10), nullable=False)
    country = Column(String(100), nullable=False, server_default="Philippines")
    lat = Column(Numeric(9, 6))   # map pin, remembered for next checkout
    lng = Column(Numeric(9, 6))
    is_default = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
